/**
 * Integration tests for malicious transaction scenarios.
 *
 * These tests validate that the transaction validator properly rejects
 * various attack vectors and malicious transaction patterns.
 *
 * Prerequisites:
 * - Local Solana test validator running on http://localhost:8899
 * - Run: ./scripts/start-test-validator.sh
 */

import { describe, it, beforeAll } from "vitest";
import {
    address,
    pipe,
    createTransactionMessage,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstruction,
    setTransactionMessageFeePayer,
    lamports,
    createNoopSigner,
    Blockhash,
} from "@solana/kit";
import {
    getSetComputeUnitLimitInstruction,
    getSetComputeUnitPriceInstruction,
    getRequestHeapFrameInstruction,
    getSetLoadedAccountsDataSizeLimitInstruction,
} from "@solana-program/compute-budget";
import {
    getTransferSolInstruction,
    getCreateAccountInstruction,
    getAssignInstruction,
    getAllocateInstruction,
} from "@solana-program/system";
import {
    getTransferInstruction,
    getApproveInstruction,
    getMintToInstruction,
    getCloseAccountInstruction,
    getSetAuthorityInstruction,
    TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";

import { createTransactionValidator } from "../../src/engine.js";
import { SignerRole } from "../../src/types.js";
import {
    createSystemProgramValidator,
    SystemInstruction,
} from "../../src/programs/system-program.js";
import { createSplTokenValidator, TokenInstruction } from "../../src/programs/spl-token.js";
import {
    createComputeBudgetValidator,
    ComputeBudgetInstruction,
} from "../../src/programs/compute-budget.js";
import { createCustomProgramValidator } from "../../src/programs/custom-program.js";

import {
    SIGNER_ADDRESS,
    ATTACKER_ADDRESS,
    VICTIM_ADDRESS,
    ALLOWED_DESTINATION,
    TREASURY_ADDRESS,
    FAKE_TOKEN_PROGRAM,
    STAKE_PROGRAM_ADDRESS,
    expectValidationError,
    initializeTestAddresses,
    toWireTransaction,
} from "../fixtures/test-helpers.js";

// Dummy blockhash for policy-only tests (no validator needed)
const DUMMY_BLOCKHASH: { blockhash: Blockhash; lastValidBlockHeight: bigint } = {
    blockhash: "11111111111111111111111111111111111111111111" as Blockhash,
    lastValidBlockHeight: 0n,
};

beforeAll(async () => {
    await initializeTestAddresses();
});

describe("Malicious Transaction Integration Tests", () => {
    describe("Unauthorized Program Attacks", () => {
        it("should reject unknown program injection", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                        },
                    }),
                ],
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) =>
                    appendTransactionMessageInstruction(
                        {
                            programAddress: FAKE_TOKEN_PROGRAM,
                            accounts: [],
                            data: new Uint8Array([0]),
                        },
                        tx,
                    ),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "unauthorized program");
        });

        it("should reject malicious token program", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSplTokenValidator({
                        instructions: {
                            [TokenInstruction.Transfer]: true,
                        },
                    }),
                ],
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) =>
                    appendTransactionMessageInstruction(
                        {
                            programAddress: FAKE_TOKEN_PROGRAM,
                            accounts: [],
                            data: new Uint8Array([3]),
                        },
                        tx,
                    ),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "unauthorized program");
        });

        it("should reject BPF Loader invoke", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const BPF_LOADER_ADDRESS = address("BPFLoader2111111111111111111111111111111111");

            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                        },
                    }),
                ],
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) =>
                    appendTransactionMessageInstruction(
                        {
                            programAddress: BPF_LOADER_ADDRESS,
                            accounts: [],
                            data: new Uint8Array([0]),
                        },
                        tx,
                    ),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "unauthorized program");
        });

        it("should reject native program not in allowlist", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                        },
                    }),
                ],
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) =>
                    appendTransactionMessageInstruction(
                        {
                            programAddress: STAKE_PROGRAM_ADDRESS,
                            accounts: [],
                            data: new Uint8Array([0]),
                        },
                        tx,
                    ),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "unauthorized program");
        });
    });

    describe("Dangerous Instructions - System Program", () => {
        it("should reject Assign to attacker program", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.Assign]: {
                                allowedOwnerPrograms: [TOKEN_PROGRAM_ADDRESS],
                            },
                        },
                    }),
                ],
            });

            const assignIx = getAssignInstruction({
                account: createNoopSigner(VICTIM_ADDRESS),
                programAddress: ATTACKER_ADDRESS,
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(assignIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "not in allowlist");
        });

        it("should reject CreateAccount to malicious owner", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.CreateAccount]: {
                                allowedOwnerPrograms: [TOKEN_PROGRAM_ADDRESS],
                                maxLamports: 10_000_000n,
                            },
                        },
                    }),
                ],
            });

            const createAccountIx = getCreateAccountInstruction({
                payer: createNoopSigner(SIGNER_ADDRESS),
                newAccount: createNoopSigner(VICTIM_ADDRESS),
                lamports: lamports(1_000_000n),
                space: 165n,
                programAddress: ATTACKER_ADDRESS,
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(createAccountIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "not in allowlist");
        });

        it("should reject TransferSol exceeds limit", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: {
                                maxLamports: 1_000_000_000n,
                            },
                        },
                    }),
                ],
            });

            const transferIx = getTransferSolInstruction({
                source: createNoopSigner(SIGNER_ADDRESS),
                destination: VICTIM_ADDRESS,
                amount: lamports(2_000_000_000n),
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "exceeds limit");
        });

        it("should reject TransferSol to unlisted destination", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: {
                                allowedDestinations: [ALLOWED_DESTINATION, TREASURY_ADDRESS],
                            },
                        },
                    }),
                ],
            });

            const transferIx = getTransferSolInstruction({
                source: createNoopSigner(SIGNER_ADDRESS),
                destination: ATTACKER_ADDRESS,
                amount: lamports(100_000n),
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "not in allowlist");
        });

        it("should reject unlisted instruction (implicitly denied)", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                        },
                    }),
                ],
            });

            const allocateIx = getAllocateInstruction({
                newAccount: createNoopSigner(SIGNER_ADDRESS),
                space: 100n,
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(allocateIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "not allowed");
        });

        it("should reject explicitly denied instruction", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                            [SystemInstruction.Assign]: false,
                        },
                    }),
                ],
            });

            const assignIx = getAssignInstruction({
                account: createNoopSigner(SIGNER_ADDRESS),
                programAddress: TOKEN_PROGRAM_ADDRESS,
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(assignIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "explicitly denied");
        });

        it("should reject CreateAccount with excessive space", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.CreateAccount]: {
                                maxSpace: 1000n,
                                maxLamports: 10_000_000n,
                            },
                        },
                    }),
                ],
            });

            const createAccountIx = getCreateAccountInstruction({
                payer: createNoopSigner(SIGNER_ADDRESS),
                newAccount: createNoopSigner(VICTIM_ADDRESS),
                lamports: lamports(1_000_000n),
                space: 10_000n,
                programAddress: TOKEN_PROGRAM_ADDRESS,
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(createAccountIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "exceeds limit");
        });
    });

    describe("Dangerous Instructions - SPL Token", () => {
        const MINT_ADDRESS = address("7777777777777777777777777777777777777777777");
        const SOURCE_TOKEN_ACCOUNT = address("8888888888888888888888888888888888888888888");
        const DEST_TOKEN_ACCOUNT = address("9999999999999999999999999999999999999999999");

        it("should reject SetAuthority mint authority change", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSplTokenValidator({
                        instructions: {
                            [TokenInstruction.SetAuthority]: {
                                allowedAuthorityTypes: [1],
                            },
                        },
                    }),
                ],
            });

            const setAuthorityIx = getSetAuthorityInstruction({
                owned: MINT_ADDRESS,
                owner: createNoopSigner(SIGNER_ADDRESS),
                authorityType: 0,
                newAuthority: ATTACKER_ADDRESS,
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(setAuthorityIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "not in allowlist");
        });

        it("should reject Approve with excessive amount", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSplTokenValidator({
                        instructions: {
                            [TokenInstruction.Approve]: {
                                maxAmount: 1_000_000n,
                            },
                        },
                    }),
                ],
            });

            const approveIx = getApproveInstruction({
                source: SOURCE_TOKEN_ACCOUNT,
                delegate: ATTACKER_ADDRESS,
                owner: createNoopSigner(SIGNER_ADDRESS),
                amount: 999_999_999n,
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(approveIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "exceeds limit");
        });

        it("should reject Approve to unlisted delegate", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSplTokenValidator({
                        instructions: {
                            [TokenInstruction.Approve]: {
                                allowedDelegates: [TREASURY_ADDRESS],
                            },
                        },
                    }),
                ],
            });

            const approveIx = getApproveInstruction({
                source: SOURCE_TOKEN_ACCOUNT,
                delegate: ATTACKER_ADDRESS,
                owner: createNoopSigner(SIGNER_ADDRESS),
                amount: 1000n,
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(approveIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "not in allowlist");
        });

        it("should reject Transfer exceeds limit", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSplTokenValidator({
                        instructions: {
                            [TokenInstruction.Transfer]: {
                                maxAmount: 1_000_000n,
                            },
                        },
                    }),
                ],
            });

            const transferIx = getTransferInstruction({
                source: SOURCE_TOKEN_ACCOUNT,
                destination: DEST_TOKEN_ACCOUNT,
                authority: createNoopSigner(SIGNER_ADDRESS),
                amount: 5_000_000n,
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "exceeds limit");
        });

        it("should reject CloseAccount to attacker destination", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSplTokenValidator({
                        instructions: {
                            [TokenInstruction.CloseAccount]: {
                                allowedDestinations: [SIGNER_ADDRESS, TREASURY_ADDRESS],
                            },
                        },
                    }),
                ],
            });

            const closeAccountIx = getCloseAccountInstruction({
                account: SOURCE_TOKEN_ACCOUNT,
                destination: ATTACKER_ADDRESS,
                owner: createNoopSigner(SIGNER_ADDRESS),
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(closeAccountIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "not in allowlist");
        });

        it("should reject MintTo with excessive amount", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSplTokenValidator({
                        instructions: {
                            [TokenInstruction.MintTo]: {
                                maxAmount: 10_000n,
                            },
                        },
                    }),
                ],
            });

            const mintToIx = getMintToInstruction({
                mint: MINT_ADDRESS,
                token: DEST_TOKEN_ACCOUNT,
                mintAuthority: createNoopSigner(SIGNER_ADDRESS),
                amount: 1_000_000n,
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(mintToIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "exceeds limit");
        });
    });

    describe("Empty/Minimal Transaction Attacks", () => {
        it("should reject transaction with zero instructions", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: {
                    signerRole: SignerRole.Any,
                    minInstructions: 1,
                },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                        },
                    }),
                ],
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "empty");
        });

        it("should reject transaction with only compute budget when minInstructions > 1", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: {
                    signerRole: SignerRole.Any,
                    minInstructions: 2,
                },
                programs: [
                    createComputeBudgetValidator({
                        instructions: {
                            [ComputeBudgetInstruction.SetComputeUnitLimit]: true,
                        },
                    }),
                ],
            });

            const computeBudgetIx = getSetComputeUnitLimitInstruction({ units: 200_000 });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(computeBudgetIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "Too few instructions");
        });
    });

    describe("Compute Budget Manipulation", () => {
        it("should reject excessive compute units", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createComputeBudgetValidator({
                        instructions: {
                            [ComputeBudgetInstruction.SetComputeUnitLimit]: {
                                maxUnits: 200_000,
                            },
                        },
                    }),
                ],
            });

            const computeBudgetIx = getSetComputeUnitLimitInstruction({ units: 1_400_000 });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(computeBudgetIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "exceeds limit");
        });

        it("should reject excessive priority fee", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createComputeBudgetValidator({
                        instructions: {
                            [ComputeBudgetInstruction.SetComputeUnitPrice]: {
                                maxMicroLamportsPerCu: 1000n,
                            },
                        },
                    }),
                ],
            });

            const computeBudgetIx = getSetComputeUnitPriceInstruction({ microLamports: 10_000n });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(computeBudgetIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "exceeds limit");
        });

        it("should reject excessive heap frame", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createComputeBudgetValidator({
                        instructions: {
                            [ComputeBudgetInstruction.RequestHeapFrame]: {
                                maxBytes: 32 * 1024,
                            },
                        },
                    }),
                ],
            });

            const heapIx = getRequestHeapFrameInstruction({ bytes: 256 * 1024 });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(heapIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "exceeds limit");
        });

        it("should reject excessive loaded accounts data size", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createComputeBudgetValidator({
                        instructions: {
                            [ComputeBudgetInstruction.SetLoadedAccountsDataSizeLimit]: {
                                maxBytes: 64 * 1024,
                            },
                        },
                    }),
                ],
            });

            const loadedAccountsIx = getSetLoadedAccountsDataSizeLimitInstruction({
                accountDataSizeLimit: 128 * 1024,
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(loadedAccountsIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "exceeds limit");
        });

        it("should reject unlisted compute budget instruction", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createComputeBudgetValidator({
                        instructions: {
                            [ComputeBudgetInstruction.SetComputeUnitLimit]: true,
                        },
                    }),
                ],
            });

            const computeBudgetIx = getSetComputeUnitPriceInstruction({ microLamports: 100n });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(computeBudgetIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "not allowed");
        });
    });

    describe("Signer Role Violations", () => {
        it("should reject FeePayerOnly when signer is participant", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: {
                    signerRole: SignerRole.FeePayerOnly,
                },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                        },
                    }),
                ],
            });

            const transferIx = getTransferSolInstruction({
                source: createNoopSigner(SIGNER_ADDRESS),
                destination: VICTIM_ADDRESS,
                amount: lamports(100_000n),
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "only be fee payer");
        });

        it("should reject FeePayerOnly when signer is not fee payer", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: {
                    signerRole: SignerRole.FeePayerOnly,
                },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                        },
                    }),
                ],
            });

            const transferIx = getTransferSolInstruction({
                source: createNoopSigner(VICTIM_ADDRESS),
                destination: ATTACKER_ADDRESS,
                amount: lamports(100_000n),
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(VICTIM_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "must be the fee payer");
        });

        it("should reject ParticipantOnly when signer is fee payer", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: {
                    signerRole: SignerRole.ParticipantOnly,
                },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                        },
                    }),
                ],
            });

            const transferIx = getTransferSolInstruction({
                source: createNoopSigner(VICTIM_ADDRESS),
                destination: ATTACKER_ADDRESS,
                amount: lamports(100_000n),
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "cannot be the fee payer");
        });

        it("should reject ParticipantOnly when signer not in instructions", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: {
                    signerRole: SignerRole.ParticipantOnly,
                },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                        },
                    }),
                ],
            });

            const transferIx = getTransferSolInstruction({
                source: createNoopSigner(VICTIM_ADDRESS),
                destination: ATTACKER_ADDRESS,
                amount: lamports(100_000n),
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(VICTIM_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "must be a participant");
        });
    });

    describe("Custom Program Discriminator Attacks", () => {
        const CUSTOM_PROGRAM = address("AaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA");
        const ALLOWED_DISCRIMINATOR = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
        const MALICIOUS_DISCRIMINATOR = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc]);

        it("should reject unknown discriminator", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createCustomProgramValidator({
                        programAddress: CUSTOM_PROGRAM,
                        allowedInstructions: [
                            {
                                discriminator: ALLOWED_DISCRIMINATOR,
                                matchMode: "prefix",
                            },
                        ],
                    }),
                ],
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) =>
                    appendTransactionMessageInstruction(
                        {
                            programAddress: CUSTOM_PROGRAM,
                            accounts: [],
                            data: MALICIOUS_DISCRIMINATOR,
                        },
                        tx,
                    ),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "not in allowlist");
        });

        it("should reject similar but wrong discriminator", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createCustomProgramValidator({
                        programAddress: CUSTOM_PROGRAM,
                        allowedInstructions: [
                            {
                                discriminator: ALLOWED_DISCRIMINATOR,
                                matchMode: "exact",
                            },
                        ],
                    }),
                ],
            });

            const similarDiscriminator = new Uint8Array([0x01, 0x02, 0x03, 0x05]);

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) =>
                    appendTransactionMessageInstruction(
                        {
                            programAddress: CUSTOM_PROGRAM,
                            accounts: [],
                            data: similarDiscriminator,
                        },
                        tx,
                    ),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "not in allowlist");
        });

        it("should reject short data that doesn't match full discriminator", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createCustomProgramValidator({
                        programAddress: CUSTOM_PROGRAM,
                        allowedInstructions: [
                            {
                                discriminator: ALLOWED_DISCRIMINATOR,
                                matchMode: "prefix",
                            },
                        ],
                    }),
                ],
            });

            // Only 2 bytes when we need 4-byte prefix
            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) =>
                    appendTransactionMessageInstruction(
                        {
                            programAddress: CUSTOM_PROGRAM,
                            accounts: [],
                            data: new Uint8Array([0x01, 0x02]),
                        },
                        tx,
                    ),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "not in allowlist");
        });
    });

    describe("Instruction-Level Typed Callbacks - Rejection Cases", () => {
        it("should reject transfer when callback enforces amount limit", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const MAX_TRANSFER = 1_000_000n;

            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            // Typed callback receives ParsedTransferSolInstruction
                            [SystemInstruction.TransferSol]: async (_ctx, parsed) => {
                                if (parsed.data.amount > MAX_TRANSFER) {
                                    return `Amount ${parsed.data.amount} exceeds max ${MAX_TRANSFER}`;
                                }
                                return true;
                            },
                        },
                    }),
                ],
            });

            const transferIx = getTransferSolInstruction({
                source: createNoopSigner(SIGNER_ADDRESS),
                destination: VICTIM_ADDRESS,
                amount: lamports(10_000_000n), // Exceeds limit
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "exceeds max");
        });

        it("should reject transfer when callback enforces destination allowlist", async () => {
            const blockhash = DUMMY_BLOCKHASH;

            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: async (_ctx, parsed) => {
                                // Only allow transfers to treasury
                                if (parsed.accounts.destination.address !== ALLOWED_DESTINATION) {
                                    return `Unauthorized destination: ${parsed.accounts.destination.address}`;
                                }
                                return true;
                            },
                        },
                    }),
                ],
            });

            const transferIx = getTransferSolInstruction({
                source: createNoopSigner(SIGNER_ADDRESS),
                destination: ATTACKER_ADDRESS, // Not allowed
                amount: lamports(100_000n),
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "Unauthorized destination");
        });

        it("should reject CreateAccount when callback enforces program ownership", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const ALLOWED_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
            const MALICIOUS_PROGRAM = address("EviL1111111111111111111111111111111111111111");

            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.CreateAccount]: async (_ctx, parsed) => {
                                if (parsed.data.programAddress !== ALLOWED_PROGRAM) {
                                    return `Only Token program accounts allowed`;
                                }
                                return true;
                            },
                        },
                    }),
                ],
            });

            const createIx = getCreateAccountInstruction({
                payer: createNoopSigner(SIGNER_ADDRESS),
                newAccount: createNoopSigner(VICTIM_ADDRESS),
                lamports: lamports(1_000_000n),
                space: 200n,
                programAddress: MALICIOUS_PROGRAM, // Not allowed
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(createIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "Only Token program");
        });

        it("should reject token transfer when callback enforces business rules", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const TOKEN_ACCOUNT = address("BbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbB");
            const DEST_TOKEN_ACCOUNT = address("CcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcC");
            const MAX_TOKENS = 1_000_000n;

            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSplTokenValidator({
                        instructions: {
                            [TokenInstruction.Transfer]: async (_ctx, parsed) => {
                                if (parsed.data.amount > MAX_TOKENS) {
                                    return `Token transfer exceeds daily limit of ${MAX_TOKENS}`;
                                }
                                return true;
                            },
                        },
                    }),
                ],
            });

            const transferIx = getTransferInstruction({
                source: TOKEN_ACCOUNT,
                destination: DEST_TOKEN_ACCOUNT,
                authority: createNoopSigner(SIGNER_ADDRESS),
                amount: 5_000_000n, // Exceeds limit
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "exceeds daily limit");
        });

        it("should reject excessive compute unit limit via callback", async () => {
            const blockhash = DUMMY_BLOCKHASH;

            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                        },
                    }),
                    createComputeBudgetValidator({
                        instructions: {
                            [ComputeBudgetInstruction.SetComputeUnitLimit]: async (
                                _ctx,
                                parsed,
                            ) => {
                                if (parsed.data.units > 500_000) {
                                    return `CU limit ${parsed.data.units} exceeds maximum of 500000`;
                                }
                                return true;
                            },
                            [ComputeBudgetInstruction.SetComputeUnitPrice]: true,
                        },
                    }),
                ],
            });

            const cuLimitIx = getSetComputeUnitLimitInstruction({ units: 1_400_000 }); // Exceeds limit
            const transferIx = getTransferSolInstruction({
                source: createNoopSigner(SIGNER_ADDRESS),
                destination: VICTIM_ADDRESS,
                amount: lamports(100_000n),
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(cuLimitIx, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "exceeds maximum");
        });

        it("should reject when callback uses context to detect suspicious activity", async () => {
            const blockhash = DUMMY_BLOCKHASH;

            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: async (ctx, parsed) => {
                                // Suspicious: signer is not source of funds
                                if (parsed.accounts.source.address !== ctx.signer) {
                                    return `Suspicious: signer ${ctx.signer} is not the source of funds`;
                                }
                                return true;
                            },
                        },
                    }),
                ],
            });

            // Transaction where victim is the source but our signer is just fee payer
            const transferIx = getTransferSolInstruction({
                source: createNoopSigner(VICTIM_ADDRESS), // Not the signer!
                destination: ATTACKER_ADDRESS,
                amount: lamports(1_000_000n),
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "Suspicious");
        });

        it("should reject when callback returns false (boolean denial)", async () => {
            const blockhash = DUMMY_BLOCKHASH;

            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: async (_ctx, _parsed) => {
                                // Simple boolean rejection
                                return false;
                            },
                        },
                    }),
                ],
            });

            const transferIx = getTransferSolInstruction({
                source: createNoopSigner(SIGNER_ADDRESS),
                destination: VICTIM_ADDRESS,
                amount: lamports(100_000n),
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expectValidationError(validator, tx, SIGNER_ADDRESS, "rejected");
        });
    });
});
