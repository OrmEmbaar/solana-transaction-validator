/**
 * Integration tests for valid transaction scenarios (happy path).
 *
 * These tests validate that legitimate transactions pass validation
 * when properly configured with appropriate policies.
 *
 * Prerequisites:
 * - Local Solana test validator running on http://localhost:8899
 * - Run: ./scripts/start-test-validator.sh
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
    address,
    pipe,
    createTransactionMessage,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstruction,
    setTransactionMessageFeePayer,
    lamports,
    createNoopSigner,
    type Blockhash,
} from "@solana/kit";
import {
    getSetComputeUnitLimitInstruction,
    getSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";
import {
    getTransferSolInstruction,
    getCreateAccountInstruction,
    getAllocateInstruction,
} from "@solana-program/system";
import {
    getTransferInstruction,
    getTransferCheckedInstruction,
    getApproveInstruction,
    getBurnInstruction,
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
    VICTIM_ADDRESS,
    TREASURY_ADDRESS,
    initializeTestAddresses,
    toWireTransaction,
} from "../fixtures/test-helpers.js";

// Dummy blockhash for policy-only tests (no validator needed)
const DUMMY_BLOCKHASH = {
    blockhash: "11111111111111111111111111111111111111111111" as Blockhash,
    lastValidBlockHeight: 0n,
};

beforeAll(async () => {
    await initializeTestAddresses();
});

describe("Valid Transaction Integration Tests", () => {
    describe("System Program - Success Cases", () => {
        it("should allow TransferSol within limits", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: {
                                maxLamports: 1_000_000_000n,
                                allowedDestinations: [TREASURY_ADDRESS],
                            },
                        },
                    }),
                ],
            });

            const transferIx = getTransferSolInstruction({
                source: createNoopSigner(SIGNER_ADDRESS),
                destination: TREASURY_ADDRESS,
                amount: lamports(500_000_000n),
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });

        it("should allow TransferSol to any destination when unrestricted", async () => {
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

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });

        it("should allow CreateAccount with allowed owner", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.CreateAccount]: {
                                allowedOwnerPrograms: [TOKEN_PROGRAM_ADDRESS],
                                maxLamports: 10_000_000n,
                                maxSpace: 1000n,
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
                programAddress: TOKEN_PROGRAM_ADDRESS,
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(createAccountIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });

        it("should allow Allocate within space limit", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.Allocate]: {
                                maxSpace: 1000n,
                            },
                        },
                    }),
                ],
            });

            const allocateIx = getAllocateInstruction({
                newAccount: createNoopSigner(SIGNER_ADDRESS),
                space: 500n,
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(allocateIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });
    });

    describe("SPL Token - Success Cases", () => {
        const MINT_ADDRESS = address("7777777777777777777777777777777777777777777");
        const SOURCE_TOKEN_ACCOUNT = address("8888888888888888888888888888888888888888888");
        const DEST_TOKEN_ACCOUNT = address("9999999999999999999999999999999999999999999");

        it("should allow Transfer within limits", async () => {
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
                amount: 500_000n,
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });

        it("should allow TransferChecked with allowed mint", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSplTokenValidator({
                        instructions: {
                            [TokenInstruction.TransferChecked]: {
                                allowedMints: [MINT_ADDRESS],
                                maxAmount: 1_000_000n,
                            },
                        },
                    }),
                ],
            });

            const transferIx = getTransferCheckedInstruction({
                source: SOURCE_TOKEN_ACCOUNT,
                mint: MINT_ADDRESS,
                destination: DEST_TOKEN_ACCOUNT,
                authority: createNoopSigner(SIGNER_ADDRESS),
                amount: 500_000n,
                decimals: 6,
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });

        it("should allow Approve to allowed delegate", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSplTokenValidator({
                        instructions: {
                            [TokenInstruction.Approve]: {
                                allowedDelegates: [TREASURY_ADDRESS],
                                maxAmount: 1_000_000n,
                            },
                        },
                    }),
                ],
            });

            const approveIx = getApproveInstruction({
                source: SOURCE_TOKEN_ACCOUNT,
                delegate: TREASURY_ADDRESS,
                owner: createNoopSigner(SIGNER_ADDRESS),
                amount: 500_000n,
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(approveIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });

        it("should allow Burn when permitted", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSplTokenValidator({
                        instructions: {
                            [TokenInstruction.Burn]: true,
                        },
                    }),
                ],
            });

            const burnIx = getBurnInstruction({
                account: SOURCE_TOKEN_ACCOUNT,
                mint: MINT_ADDRESS,
                authority: createNoopSigner(SIGNER_ADDRESS),
                amount: 1000n,
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(burnIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });
    });

    describe("Compute Budget - Success Cases", () => {
        it("should allow SetComputeUnitLimit within bounds", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createComputeBudgetValidator({
                        instructions: {
                            [ComputeBudgetInstruction.SetComputeUnitLimit]: {
                                maxUnits: 1_400_000,
                            },
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

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });

        it("should allow SetComputeUnitPrice within bounds", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createComputeBudgetValidator({
                        instructions: {
                            [ComputeBudgetInstruction.SetComputeUnitPrice]: {
                                maxMicroLamportsPerCu: 10_000n,
                            },
                        },
                    }),
                ],
            });

            const computeBudgetIx = getSetComputeUnitPriceInstruction({ microLamports: 1000n });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(computeBudgetIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });

        it("should allow standard compute budget + transfer combo", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createComputeBudgetValidator({
                        instructions: {
                            [ComputeBudgetInstruction.SetComputeUnitLimit]: true,
                            [ComputeBudgetInstruction.SetComputeUnitPrice]: true,
                        },
                    }),
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
                        getSetComputeUnitLimitInstruction({ units: 200_000 }),
                        tx,
                    ),
                (tx) =>
                    appendTransactionMessageInstruction(
                        getSetComputeUnitPriceInstruction({ microLamports: 1000n }),
                        tx,
                    ),
                (tx) =>
                    appendTransactionMessageInstruction(
                        getTransferSolInstruction({
                            source: createNoopSigner(SIGNER_ADDRESS),
                            destination: VICTIM_ADDRESS,
                            amount: lamports(100_000n),
                        }),
                        tx,
                    ),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });
    });

    describe("Multi-instruction - Success Cases", () => {
        it("should allow multiple allowed instructions", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: {
                    signerRole: SignerRole.Any,
                    maxInstructions: 5,
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
                (tx) =>
                    appendTransactionMessageInstruction(
                        getTransferSolInstruction({
                            source: createNoopSigner(SIGNER_ADDRESS),
                            destination: VICTIM_ADDRESS,
                            amount: lamports(100_000n),
                        }),
                        tx,
                    ),
                (tx) =>
                    appendTransactionMessageInstruction(
                        getTransferSolInstruction({
                            source: createNoopSigner(SIGNER_ADDRESS),
                            destination: TREASURY_ADDRESS,
                            amount: lamports(50_000n),
                        }),
                        tx,
                    ),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });

        it("should allow mixed programs (System + Token)", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createSystemProgramValidator({
                        instructions: {
                            [SystemInstruction.TransferSol]: true,
                        },
                    }),
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
                        getTransferSolInstruction({
                            source: createNoopSigner(SIGNER_ADDRESS),
                            destination: VICTIM_ADDRESS,
                            amount: lamports(100_000n),
                        }),
                        tx,
                    ),
                (tx) =>
                    appendTransactionMessageInstruction(
                        getTransferInstruction({
                            source: address("8888888888888888888888888888888888888888888"),
                            destination: address("9999999999999999999999999999999999999999999"),
                            authority: createNoopSigner(SIGNER_ADDRESS),
                            amount: 1000n,
                        }),
                        tx,
                    ),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });
    });

    describe("Signer Roles - Success Cases", () => {
        it("should allow FeePayerOnly when compliant", async () => {
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
                destination: TREASURY_ADDRESS,
                amount: lamports(100_000n),
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });

        it("should allow ParticipantOnly when compliant", async () => {
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
                source: createNoopSigner(SIGNER_ADDRESS),
                destination: TREASURY_ADDRESS,
                amount: lamports(100_000n),
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(VICTIM_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });

        it("should allow Any role with flexible transaction", async () => {
            const blockhash = DUMMY_BLOCKHASH;
            const validator = createTransactionValidator({
                global: {
                    signerRole: SignerRole.Any,
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
                destination: TREASURY_ADDRESS,
                amount: lamports(100_000n),
            });

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) => appendTransactionMessageInstruction(transferIx, tx),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });
    });

    describe("Custom Program - Success Cases", () => {
        const CUSTOM_PROGRAM = address("AaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA");
        const ALLOWED_DISCRIMINATOR = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

        it("should allow transaction with allowed discriminator", async () => {
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
                            data: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]),
                        },
                        tx,
                    ),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });

        it("should allow transaction with custom validator callback", async () => {
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
                        customValidator: async (ctx) => {
                            // Allow if data length is reasonable
                            if (ctx.instruction.data && ctx.instruction.data.length <= 100) {
                                return true;
                            }
                            return "Data too long";
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
                            programAddress: CUSTOM_PROGRAM,
                            accounts: [],
                            data: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x50]), // 5 bytes, valid
                        },
                        tx,
                    ),
                (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
            );
            const tx = toWireTransaction(txMessage);

            await expect(validator(tx, SIGNER_ADDRESS)).resolves.not.toThrow();
        });
    });
});
