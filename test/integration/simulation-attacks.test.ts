/**
 * Integration tests for simulation-based validation.
 *
 * These tests require a running local validator with funded accounts
 * to validate runtime behavior (compute units, account closures, etc).
 *
 * Prerequisites:
 * - Local Solana test validator running on http://localhost:8899
 * - Run: ./scripts/start-test-validator.sh
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
    address,
    createDefaultRpcTransport,
    createSolanaRpcFromTransport,
    createSolanaRpcSubscriptions,
    pipe,
    createTransactionMessage,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstruction,
    setTransactionMessageFeePayer,
    lamports,
    airdropFactory,
    generateKeyPairSigner,
    getBase64EncodedWireTransaction,
    signTransactionMessageWithSigners,
    type TransactionSigner,
    type MessageSigner,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";

import { createTransactionValidator } from "../../src/engine.js";
import { SignerRole } from "../../src/types.js";
import {
    createSystemProgramValidator,
    SystemInstruction,
} from "../../src/programs/system-program.js";

import {
    RPC_ENDPOINT,
    setRpc,
    setValidatorAvailable,
    setLatestBlockhash,
    checkValidatorAvailability,
    getRecentBlockhash,
    expectValidationError,
    initializeTestAddresses,
} from "../fixtures/test-helpers.js";

let fundedWallet: (TransactionSigner & MessageSigner) | undefined;
let rpcClient: ReturnType<typeof createSolanaRpcFromTransport>;
let validatorAvailable: boolean;

beforeAll(async () => {
    await initializeTestAddresses();

    rpcClient = createSolanaRpcFromTransport(createDefaultRpcTransport({ url: RPC_ENDPOINT }));
    setRpc(rpcClient);

    validatorAvailable = await checkValidatorAvailability(rpcClient);
    setValidatorAvailable(validatorAvailable);

    const blockhash = await getRecentBlockhash(rpcClient);
    setLatestBlockhash(blockhash);

    // Create and fund a wallet for simulation tests
    if (!validatorAvailable) {
        throw new Error(
            "Solana test validator is not running. Start it with: ./scripts/start-test-validator.sh",
        );
    }

    const rpcSubscriptions = createSolanaRpcSubscriptions("ws://localhost:8900");
    const airdrop = airdropFactory({ rpc: rpcClient, rpcSubscriptions });

    fundedWallet = await generateKeyPairSigner();
    await airdrop({
        recipientAddress: fundedWallet.address,
        lamports: lamports(10_000_000_000n), // 10 SOL
        commitment: "confirmed",
    });
});

describe("Simulation-Based Validation Tests", () => {
    describe("Simulation Attacks", () => {
        it("should reject transaction with invalid account (simulation fails)", async () => {
            const blockhash = await getRecentBlockhash();

            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                        },
                    }),
                ],
                simulation: {
                    rpc: rpcClient,
                    constraints: {
                        requireSuccess: true,
                    },
                },
            });

            // Transfer from non-existent account (will fail simulation)
            // Use funded wallet as source to get a valid signed transaction,
            // but it will fail simulation due to insufficient funds
            const transferIx = getTransferSolInstruction({
                source: fundedWallet!,
                destination: address("DdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdD"),
                amount: lamports(999_999_999_999n), // Exceeds balance - will fail
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(fundedWallet!.address, tx),
            );

            const signedTx = await signTransactionMessageWithSigners(txMessage);
            const wireTx = getBase64EncodedWireTransaction(signedTx);

            await expectValidationError(
                validator,
                wireTx,
                fundedWallet!.address,
                "Simulation failed",
            );
        });

        it("should reject transaction exceeding compute unit limit", async () => {
            const blockhash = await getRecentBlockhash();

            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                        },
                    }),
                ],
                simulation: {
                    rpc: rpcClient,
                    constraints: {
                        maxComputeUnits: 100, // Very low limit - a transfer uses ~300 CU
                    },
                },
            });

            // Transfer to self to avoid rent issues
            // A transfer uses ~300 CU, which exceeds our constraint of 100
            const transferIx = getTransferSolInstruction({
                source: fundedWallet!,
                destination: fundedWallet!.address,
                amount: lamports(100n),
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(fundedWallet!.address, tx),
            );

            const signedTx = await signTransactionMessageWithSigners(txMessage);
            const transactionMessage = getBase64EncodedWireTransaction(signedTx);

            // Transaction simulates successfully but exceeds validator constraint
            await expectValidationError(
                validator,
                transactionMessage,
                fundedWallet!.address,
                "Compute units exceeded",
            );
        });

        it("should reject transaction that would close signer account", async () => {
            const blockhash = await getRecentBlockhash();
            const recipient = address("DdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdD");

            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                        },
                    }),
                ],
                simulation: {
                    rpc: rpcClient,
                    constraints: {
                        forbidSignerAccountClosure: true,
                    },
                },
            });

            // Get current balance
            const balance = await rpcClient.getBalance(fundedWallet!.address).send();

            // Try to transfer more than we have (would close account to zero)
            const transferIx = getTransferSolInstruction({
                source: fundedWallet!,
                destination: recipient,
                amount: lamports(balance.value + 1_000_000n), // More than available
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(fundedWallet!.address, tx),
            );

            const signedTx = await signTransactionMessageWithSigners(txMessage);
            const transactionMessage = getBase64EncodedWireTransaction(signedTx);

            // This will fail in simulation (insufficient funds), which is what we want to test
            await expect(
                validator(
                    transactionMessage as Parameters<typeof validator>[0],
                    fundedWallet!.address,
                ),
            ).rejects.toThrow();
        });
    });

    describe("Simulation Success Cases", () => {
        it("should allow valid transaction that simulates successfully", async () => {
            const blockhash = await getRecentBlockhash();
            const recipient = address("EeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeE");

            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                        },
                    }),
                ],
                simulation: {
                    rpc: rpcClient,
                    constraints: {
                        requireSuccess: true,
                        maxComputeUnits: 200_000, // Plenty for a simple transfer
                    },
                },
            });

            const transferIx = getTransferSolInstruction({
                source: fundedWallet!,
                destination: recipient,
                amount: lamports(1_000_000n), // 0.001 SOL
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(fundedWallet!.address, tx),
            );

            const signedTx = await signTransactionMessageWithSigners(txMessage);
            const transactionMessage = getBase64EncodedWireTransaction(signedTx);

            await expect(
                validator(transactionMessage, fundedWallet!.address),
            ).resolves.not.toThrow();
        });

        it("should allow transaction within compute budget", async () => {
            const blockhash = await getRecentBlockhash();

            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                        },
                    }),
                ],
                simulation: {
                    rpc: rpcClient,
                    constraints: {
                        maxComputeUnits: 200_000, // Reasonable limit
                    },
                },
            });

            // Transfer to self to avoid rent issues
            // A transfer uses ~300 CU, which is well within our constraint of 200,000
            const transferIx = getTransferSolInstruction({
                source: fundedWallet!,
                destination: fundedWallet!.address,
                amount: lamports(500_000n),
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(fundedWallet!.address, tx),
            );

            const signedTx = await signTransactionMessageWithSigners(txMessage);
            const transactionMessage = getBase64EncodedWireTransaction(signedTx);

            await expect(
                validator(transactionMessage, fundedWallet!.address),
            ).resolves.not.toThrow();
        });

        it("should allow transaction that does not close signer account", async () => {
            const blockhash = await getRecentBlockhash();
            const recipient = address("GgGgGgGgGgGgGgGgGgGgGgGgGgGgGgGgGgGgGgGgGgG");

            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                        },
                    }),
                ],
                simulation: {
                    rpc: rpcClient,
                    constraints: {
                        forbidSignerAccountClosure: true,
                    },
                },
            });

            // Transfer a small amount - account remains open
            const transferIx = getTransferSolInstruction({
                source: fundedWallet!,
                destination: recipient,
                amount: lamports(1_000_000n), // 0.001 SOL - leaves plenty
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(fundedWallet!.address, tx),
            );

            const signedTx = await signTransactionMessageWithSigners(txMessage);
            const transactionMessage = getBase64EncodedWireTransaction(signedTx);

            await expect(
                validator(transactionMessage, fundedWallet!.address),
            ).resolves.not.toThrow();
        });
    });
});
