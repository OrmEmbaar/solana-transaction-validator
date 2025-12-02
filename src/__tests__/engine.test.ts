import { describe, it, expect, vi } from "vitest";
import { createPolicyValidator } from "../engine.js";
import { type ProgramPolicy, SignerRole } from "../types.js";
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

// Helper to create a mock ProgramPolicy
const createMockPolicy = (
    programAddress: string,
    options?: { required?: boolean | (number | string)[] },
): ProgramPolicy => ({
    programAddress: address(programAddress),
    required: options?.required,
    validate: vi.fn().mockResolvedValue(true),
});

describe("PolicyEngine", () => {
    it("should allow transaction when program policy passes", async () => {
        const programId = "11111111111111111111111111111111";
        const mockPolicy = createMockPolicy(programId);

        const validator = createPolicyValidator({
            global: {
                signerRole: SignerRole.Any,
            },
            programs: [mockPolicy],
        });
        const tx = createTestTransaction();

        await expect(
            validator(tx, { signer: address("11111111111111111111111111111111") }),
        ).resolves.not.toThrow();
    });

    it("should route to program-specific policies", async () => {
        const programId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        const tokenPolicy = createMockPolicy(programId);

        const validator = createPolicyValidator({
            global: {
                signerRole: SignerRole.Any,
            },
            programs: [tokenPolicy],
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
            programs: [], // No programs allowed
        });

        const programId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        const tx = createTestTransaction(programId);

        await expect(
            validator(tx, { signer: address("11111111111111111111111111111111") }),
        ).rejects.toThrow(/unauthorized program/);
    });

    it("should fail if a program policy returns false", async () => {
        const programId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        const tokenPolicy: ProgramPolicy = {
            programAddress: address(programId),
            validate: vi.fn().mockResolvedValue("Token policy says no"),
        };

        const validator = createPolicyValidator({
            global: {
                signerRole: SignerRole.Any,
            },
            programs: [tokenPolicy],
        });

        const tx = createTestTransaction(programId);

        await expect(
            validator(tx, { signer: address("11111111111111111111111111111111") }),
        ).rejects.toThrow("Token policy says no");
    });

    it("should throw on duplicate program policies", () => {
        const programId = "11111111111111111111111111111111";

        expect(() =>
            createPolicyValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createMockPolicy(programId),
                    createMockPolicy(programId), // Duplicate
                ],
            }),
        ).toThrow(/Duplicate program policy/);
    });

    describe("Required Programs", () => {
        it("should pass when required program is present", async () => {
            const programId = "11111111111111111111111111111111";
            const mockPolicy = createMockPolicy(programId, { required: true });

            const validator = createPolicyValidator({
                global: { signerRole: SignerRole.Any },
                programs: [mockPolicy],
            });

            const tx = createTestTransaction(programId);
            await expect(
                validator(tx, { signer: address("11111111111111111111111111111111") }),
            ).resolves.not.toThrow();
        });

        it("should fail when required program is missing", async () => {
            const requiredProgramId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
            const actualProgramId = "11111111111111111111111111111111";

            const validator = createPolicyValidator({
                global: { signerRole: SignerRole.Any },
                programs: [
                    createMockPolicy(requiredProgramId, { required: true }),
                    createMockPolicy(actualProgramId),
                ],
            });

            const tx = createTestTransaction(actualProgramId);
            await expect(
                validator(tx, { signer: address("11111111111111111111111111111111") }),
            ).rejects.toThrow(/Required program.*not present/);
        });
    });

    describe("Required Instructions", () => {
        it("should pass when required instruction is present", async () => {
            const programId = "11111111111111111111111111111111";
            const mockPolicy = createMockPolicy(programId, { required: [0] }); // Require instruction discriminator 0

            const validator = createPolicyValidator({
                global: { signerRole: SignerRole.Any },
                programs: [mockPolicy],
            });

            // Create transaction with instruction data starting with 0
            const tx = createTestTransaction(programId, new Uint8Array([0, 1, 2]));
            await expect(
                validator(tx, { signer: address("11111111111111111111111111111111") }),
            ).resolves.not.toThrow();
        });

        it("should fail when required instruction is missing", async () => {
            const programId = "11111111111111111111111111111111";
            const mockPolicy = createMockPolicy(programId, { required: [5] }); // Require instruction discriminator 5

            const validator = createPolicyValidator({
                global: { signerRole: SignerRole.Any },
                programs: [mockPolicy],
            });

            // Create transaction with instruction data starting with 0 (not 5)
            const tx = createTestTransaction(programId, new Uint8Array([0, 1, 2]));
            await expect(
                validator(tx, { signer: address("11111111111111111111111111111111") }),
            ).rejects.toThrow(/Required instruction 5.*not present/);
        });

        it("should pass when all required instructions are present", async () => {
            const programId = address("11111111111111111111111111111111");
            const mockPolicy = createMockPolicy("11111111111111111111111111111111", {
                required: [0, 1],
            }); // Require both instructions

            const validator = createPolicyValidator({
                global: { signerRole: SignerRole.Any },
                programs: [mockPolicy],
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

    describe("ProgramPolicy types", () => {
        it("should accept optional program (no required field)", async () => {
            const programId = "11111111111111111111111111111111";
            const policy: ProgramPolicy = {
                programAddress: address(programId),
                validate: vi.fn().mockResolvedValue(true),
            };

            const validator = createPolicyValidator({
                global: { signerRole: SignerRole.Any },
                programs: [policy],
            });

            const tx = createTestTransaction(programId);
            await expect(
                validator(tx, { signer: address("11111111111111111111111111111111") }),
            ).resolves.not.toThrow();
        });

        it("should accept required=false as optional", async () => {
            const programId = "11111111111111111111111111111111";
            const policy: ProgramPolicy = {
                programAddress: address(programId),
                required: false,
                validate: vi.fn().mockResolvedValue(true),
            };

            const validator = createPolicyValidator({
                global: { signerRole: SignerRole.Any },
                programs: [policy],
            });

            const tx = createTestTransaction(programId);
            await expect(
                validator(tx, { signer: address("11111111111111111111111111111111") }),
            ).resolves.not.toThrow();
        });
    });
});
