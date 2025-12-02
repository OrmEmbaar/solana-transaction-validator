import { describe, it, expect, vi } from "vitest";
import { createPolicyValidator, type ProgramConfig } from "../engine.js";
import { type InstructionPolicy, SignerRole } from "../types.js";
import {
    address,
    compileTransactionMessage,
    pipe,
    createTransactionMessage,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstruction,
    setTransactionMessageFeePayer,
    type Blockhash,
} from "@solana/kit";

// Helper to create a valid transaction message
const createTestTransaction = (
    programId = "11111111111111111111111111111111",
    instructionData = new Uint8Array([]),
) => {
    const blockhash = {
        blockhash: "5c9TGe5te815W476jY7Z96PE5844626366663444346134646261393166" as Blockhash,
        lastValidBlockHeight: BigInt(0),
    };
    // Use a distinct, valid address for the fee payer
    const payer = address("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T");

    return pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
        (tx) =>
            appendTransactionMessageInstruction(
                {
                    programAddress: address(programId),
                    accounts: [],
                    data: instructionData,
                },
                tx,
            ),
        (tx) => setTransactionMessageFeePayer(payer, tx),
        compileTransactionMessage,
    );
};

describe("PolicyEngine", () => {
    const mockInstructionPolicy: InstructionPolicy = {
        validate: vi.fn().mockResolvedValue(true),
    };

    it("should allow transaction when program policy passes", async () => {
        const programId = address("11111111111111111111111111111111");
        const validator = createPolicyValidator({
            global: {
                signerRole: SignerRole.Any,
            },
            programs: {
                [programId]: { policy: mockInstructionPolicy },
            },
        });
        const tx = createTestTransaction();

        await expect(
            validator(tx, { signer: address("11111111111111111111111111111111") }),
        ).resolves.not.toThrow();
    });

    it("should route to program-specific policies", async () => {
        const programId = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
        const tokenPolicy: InstructionPolicy = {
            validate: vi.fn().mockResolvedValue(true),
        };

        const validator = createPolicyValidator({
            global: {
                signerRole: SignerRole.Any,
            },
            programs: { [programId]: { policy: tokenPolicy } },
        });

        const tx = createTestTransaction(programId);

        await expect(
            validator(tx, { signer: address("11111111111111111111111111111111") }),
        ).resolves.not.toThrow();

        expect(tokenPolicy.validate).toHaveBeenCalled();
    });

    it("should deny unknown programs (strict allowlist)", async () => {
        const validator = createPolicyValidator({
            global: {
                signerRole: SignerRole.Any,
            },
            programs: {}, // No programs allowed
        });

        const programId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        const tx = createTestTransaction(programId);

        await expect(
            validator(tx, { signer: address("11111111111111111111111111111111") }),
        ).rejects.toThrow(/unauthorized program/);
    });

    it("should fail if a program policy returns false", async () => {
        const programId = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
        const tokenPolicy: InstructionPolicy = {
            validate: vi.fn().mockResolvedValue("Token policy says no"),
        };

        const validator = createPolicyValidator({
            global: {
                signerRole: SignerRole.Any,
            },
            programs: { [programId]: { policy: tokenPolicy } },
        });

        const tx = createTestTransaction(programId);

        await expect(
            validator(tx, { signer: address("11111111111111111111111111111111") }),
        ).rejects.toThrow("Token policy says no");
    });

    describe("Required Programs", () => {
        it("should pass when required program is present", async () => {
            const programId = address("11111111111111111111111111111111");
            const validator = createPolicyValidator({
                global: { signerRole: SignerRole.Any },
                programs: {
                    [programId]: {
                        policy: mockInstructionPolicy,
                        required: true,
                    },
                },
            });

            const tx = createTestTransaction(programId);
            await expect(
                validator(tx, { signer: address("11111111111111111111111111111111") }),
            ).resolves.not.toThrow();
        });

        it("should fail when required program is missing", async () => {
            const requiredProgramId = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
            const actualProgramId = address("11111111111111111111111111111111");

            const validator = createPolicyValidator({
                global: { signerRole: SignerRole.Any },
                programs: {
                    [requiredProgramId]: {
                        policy: mockInstructionPolicy,
                        required: true,
                    },
                    [actualProgramId]: {
                        policy: mockInstructionPolicy,
                    },
                },
            });

            const tx = createTestTransaction(actualProgramId);
            await expect(
                validator(tx, { signer: address("11111111111111111111111111111111") }),
            ).rejects.toThrow(/Required program.*not present/);
        });
    });

    describe("Required Instructions", () => {
        it("should pass when required instruction is present", async () => {
            const programId = address("11111111111111111111111111111111");
            const validator = createPolicyValidator({
                global: { signerRole: SignerRole.Any },
                programs: {
                    [programId]: {
                        policy: mockInstructionPolicy,
                        required: [0], // Require instruction discriminator 0
                    },
                },
            });

            // Create transaction with instruction data starting with 0
            const tx = createTestTransaction(programId, new Uint8Array([0, 1, 2]));
            await expect(
                validator(tx, { signer: address("11111111111111111111111111111111") }),
            ).resolves.not.toThrow();
        });

        it("should fail when required instruction is missing", async () => {
            const programId = address("11111111111111111111111111111111");
            const validator = createPolicyValidator({
                global: { signerRole: SignerRole.Any },
                programs: {
                    [programId]: {
                        policy: mockInstructionPolicy,
                        required: [5], // Require instruction discriminator 5
                    },
                },
            });

            // Create transaction with instruction data starting with 0 (not 5)
            const tx = createTestTransaction(programId, new Uint8Array([0, 1, 2]));
            await expect(
                validator(tx, { signer: address("11111111111111111111111111111111") }),
            ).rejects.toThrow(/Required instruction 5.*not present/);
        });

        it("should pass when all required instructions are present", async () => {
            const programId = address("11111111111111111111111111111111");
            const validator = createPolicyValidator({
                global: { signerRole: SignerRole.Any },
                programs: {
                    [programId]: {
                        policy: mockInstructionPolicy,
                        required: [0, 1], // Require both instructions
                    },
                },
            });

            // Create transaction with two instructions
            const blockhash = {
                blockhash:
                    "5c9TGe5te815W476jY7Z96PE5844626366663444346134646261393166" as Blockhash,
                lastValidBlockHeight: BigInt(0),
            };
            const payer = address("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T");

            const tx = pipe(
                createTransactionMessage({ version: 0 }),
                (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
                (m) =>
                    appendTransactionMessageInstruction(
                        { programAddress: programId, accounts: [], data: new Uint8Array([0]) },
                        m,
                    ),
                (m) =>
                    appendTransactionMessageInstruction(
                        { programAddress: programId, accounts: [], data: new Uint8Array([1]) },
                        m,
                    ),
                (m) => setTransactionMessageFeePayer(payer, m),
                compileTransactionMessage,
            );

            await expect(
                validator(tx, { signer: address("11111111111111111111111111111111") }),
            ).resolves.not.toThrow();
        });
    });

    describe("ProgramConfig types", () => {
        it("should accept optional program (no required field)", async () => {
            const programId = address("11111111111111111111111111111111");
            const config: ProgramConfig = {
                policy: mockInstructionPolicy,
            };

            const validator = createPolicyValidator({
                global: { signerRole: SignerRole.Any },
                programs: { [programId]: config },
            });

            const tx = createTestTransaction(programId);
            await expect(
                validator(tx, { signer: address("11111111111111111111111111111111") }),
            ).resolves.not.toThrow();
        });

        it("should accept required=false as optional", async () => {
            const programId = address("11111111111111111111111111111111");
            const config: ProgramConfig = {
                policy: mockInstructionPolicy,
                required: false,
            };

            const validator = createPolicyValidator({
                global: { signerRole: SignerRole.Any },
                programs: { [programId]: config },
            });

            const tx = createTestTransaction(programId);
            await expect(
                validator(tx, { signer: address("11111111111111111111111111111111") }),
            ).resolves.not.toThrow();
        });
    });
});
