import { describe, it, expect } from "vitest";
import { createSystemProgramValidator, SystemInstruction } from "../system-program.js";
import type { InstructionValidationContext } from "../../types.js";
import { address, type Address, type Instruction } from "@solana/kit";
import {
    getTransferSolInstruction,
    getCreateAccountInstruction,
    getAssignInstruction,
    getAllocateInstruction,
} from "@solana-program/system";

// Use valid base58 addresses (32 ones = System Program format)
const SIGNER = address("11111111111111111111111111111112");
const DESTINATION = address("11111111111111111111111111111113");
const ANOTHER_DESTINATION = address("11111111111111111111111111111114");
const PROGRAM_OWNER = address("11111111111111111111111111111115");
const ANOTHER_OWNER = address("11111111111111111111111111111116");

// Helper to create a mock instruction context
const createMockContext = (instruction: Instruction): InstructionValidationContext => {
    return {
        signer: SIGNER,
        transaction: {} as InstructionValidationContext["transaction"],
        decompiledMessage: {} as InstructionValidationContext["decompiledMessage"],
        instruction: instruction as InstructionValidationContext["instruction"],
        instructionIndex: 0,
    };
};

// Helper to create a TransferSol instruction
const createTransferInstruction = (amount: bigint, destination: Address = DESTINATION) => {
    return getTransferSolInstruction({
        source: {
            address: SIGNER,
            role: 3,
        } as unknown as Parameters<typeof getTransferSolInstruction>[0]["source"],
        destination,
        amount,
    });
};

// Helper to create a CreateAccount instruction
const createCreateAccountInstruction = (
    lamports: bigint,
    space: bigint,
    programAddress: Address = PROGRAM_OWNER,
) => {
    return getCreateAccountInstruction({
        payer: {
            address: SIGNER,
            role: 3,
        } as unknown as Parameters<typeof getCreateAccountInstruction>[0]["payer"],
        newAccount: {
            address: DESTINATION,
            role: 3,
        } as unknown as Parameters<typeof getCreateAccountInstruction>[0]["newAccount"],
        lamports,
        space,
        programAddress,
    });
};

// Helper to create an Assign instruction
const createAssignInstruction = (programAddress: Address = PROGRAM_OWNER) => {
    return getAssignInstruction({
        account: {
            address: SIGNER,
            role: 3,
        } as unknown as Parameters<typeof getAssignInstruction>[0]["account"],
        programAddress,
    });
};

// Helper to create an Allocate instruction
const createAllocateInstruction = (space: bigint) => {
    return getAllocateInstruction({
        newAccount: {
            address: SIGNER,
            role: 3,
        } as unknown as Parameters<typeof getAllocateInstruction>[0]["newAccount"],
        space,
    });
};

describe("createSystemProgramValidator", () => {
    describe("instruction allowlist", () => {
        it("should deny instruction when not in config", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    // TransferSol is omitted
                },
            });

            const ix = createTransferInstruction(1000n);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toContain("TransferSol instruction not allowed");
        });

        it("should allow instruction when set to true", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: true,
                },
            });

            const ix = createTransferInstruction(1000n);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });

        it("should allow instruction when config object provided", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: {},
                },
            });

            const ix = createTransferInstruction(1000n);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });
    });

    describe("TransferSol validation", () => {
        it("should allow transfer within limit", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: {
                        maxLamports: 1_000_000n,
                    },
                },
            });

            const ix = createTransferInstruction(500_000n);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });

        it("should allow transfer at exact limit", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: {
                        maxLamports: 1_000_000n,
                    },
                },
            });

            const ix = createTransferInstruction(1_000_000n);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });

        it("should reject transfer exceeding limit", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: {
                        maxLamports: 1_000_000n,
                    },
                },
            });

            const ix = createTransferInstruction(1_000_001n);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toContain("exceeds limit");
            expect(result).toContain("1000001");
        });

        it("should allow transfer to allowed destination", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: {
                        allowedDestinations: [DESTINATION],
                    },
                },
            });

            const ix = createTransferInstruction(1000n, DESTINATION);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });

        it("should reject transfer to non-allowed destination", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: {
                        allowedDestinations: [DESTINATION],
                    },
                },
            });

            const ix = createTransferInstruction(1000n, ANOTHER_DESTINATION);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toContain("not in allowlist");
        });

        it("should enforce both amount and destination constraints", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: {
                        maxLamports: 1_000_000n,
                        allowedDestinations: [DESTINATION],
                    },
                },
            });

            // Valid amount, valid destination
            const ix1 = createTransferInstruction(500_000n, DESTINATION);
            expect(await policy.validate(createMockContext(ix1))).toBe(true);

            // Invalid amount
            const ix2 = createTransferInstruction(2_000_000n, DESTINATION);
            expect(await policy.validate(createMockContext(ix2))).toContain("exceeds limit");

            // Invalid destination
            const ix3 = createTransferInstruction(500_000n, ANOTHER_DESTINATION);
            expect(await policy.validate(createMockContext(ix3))).toContain("not in allowlist");
        });
    });

    describe("CreateAccount validation", () => {
        it("should allow create account within limits", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.CreateAccount]: {
                        maxLamports: 1_000_000_000n,
                        maxSpace: 1000n,
                    },
                },
            });

            const ix = createCreateAccountInstruction(500_000_000n, 500n);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });

        it("should reject create account exceeding lamports limit", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.CreateAccount]: {
                        maxLamports: 1_000_000_000n,
                    },
                },
            });

            const ix = createCreateAccountInstruction(2_000_000_000n, 100n);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toContain("lamports");
            expect(result).toContain("exceeds limit");
        });

        it("should reject create account exceeding space limit", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.CreateAccount]: {
                        maxSpace: 1000n,
                    },
                },
            });

            const ix = createCreateAccountInstruction(1_000_000n, 2000n);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toContain("space");
            expect(result).toContain("exceeds limit");
        });

        it("should allow create account with allowed owner program", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.CreateAccount]: {
                        allowedOwnerPrograms: [PROGRAM_OWNER],
                    },
                },
            });

            const ix = createCreateAccountInstruction(1_000_000n, 100n, PROGRAM_OWNER);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });

        it("should reject create account with non-allowed owner program", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.CreateAccount]: {
                        allowedOwnerPrograms: [PROGRAM_OWNER],
                    },
                },
            });

            const ix = createCreateAccountInstruction(1_000_000n, 100n, ANOTHER_OWNER);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toContain("owner program");
            expect(result).toContain("not in allowlist");
        });
    });

    describe("Assign validation", () => {
        it("should allow assign with allowed owner program", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.Assign]: {
                        allowedOwnerPrograms: [PROGRAM_OWNER],
                    },
                },
            });

            const ix = createAssignInstruction(PROGRAM_OWNER);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });

        it("should reject assign with non-allowed owner program", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.Assign]: {
                        allowedOwnerPrograms: [PROGRAM_OWNER],
                    },
                },
            });

            const ix = createAssignInstruction(ANOTHER_OWNER);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toContain("owner program");
            expect(result).toContain("not in allowlist");
        });
    });

    describe("Allocate validation", () => {
        it("should allow allocate within space limit", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.Allocate]: {
                        maxSpace: 1000n,
                    },
                },
            });

            const ix = createAllocateInstruction(500n);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });

        it("should reject allocate exceeding space limit", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.Allocate]: {
                        maxSpace: 1000n,
                    },
                },
            });

            const ix = createAllocateInstruction(2000n);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toContain("space");
            expect(result).toContain("exceeds limit");
        });
    });

    describe("custom validator", () => {
        it("should run custom validator after built-in validation", async () => {
            let customValidatorCalled = false;
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: {
                        maxLamports: 1_000_000n,
                    },
                },
                customValidator: () => {
                    customValidatorCalled = true;
                    return true;
                },
            });

            const ix = createTransferInstruction(500_000n);
            const ctx = createMockContext(ix);
            await policy.validate(ctx);
            expect(customValidatorCalled).toBe(true);
        });

        it("should not run custom validator if built-in validation fails", async () => {
            let customValidatorCalled = false;
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: {
                        maxLamports: 1_000_000n,
                    },
                },
                customValidator: () => {
                    customValidatorCalled = true;
                    return true;
                },
            });

            const ix = createTransferInstruction(2_000_000n);
            const ctx = createMockContext(ix);
            await policy.validate(ctx);
            expect(customValidatorCalled).toBe(false);
        });

        it("should return custom validator error", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: true,
                },
                customValidator: () => "Custom validation failed",
            });

            const ix = createTransferInstruction(1000n);
            const ctx = createMockContext(ix);
            const result = await policy.validate(ctx);
            expect(result).toBe("Custom validation failed");
        });
    });

    describe("program address validation", () => {
        it("should throw error for instruction from wrong program", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: true,
                },
            });

            const wrongProgramIx = {
                programAddress: address("11111111111111111111111111111117"),
                data: new Uint8Array([2, 0, 0, 0]), // TransferSol discriminator
                accounts: [],
            };

            const ctx = createMockContext(wrongProgramIx as Instruction);
            // The assertion throws a SolanaError when program address doesn't match
            await expect(policy.validate(ctx)).rejects.toThrow("Expected instruction");
        });
    });
});
