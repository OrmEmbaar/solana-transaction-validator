import { describe, it, expect } from "vitest";
import { createCustomProgramValidator } from "../custom-program.js";
import type { ValidationContext } from "../../types.js";
import { address, type Address, type Instruction } from "@solana/kit";

// Use valid base58 addresses (44 chars for 32 bytes, no 0, O, I, l)
// System program is 11111111111111111111111111111111 (32 ones)
const PROGRAM_ADDRESS = address("11111111111111111111111111111112");
const ANOTHER_PROGRAM = address("11111111111111111111111111111113");
const SIGNER_ADDRESS = address("11111111111111111111111111111114");

const createMockContext = (): ValidationContext => {
    return {
        signer: SIGNER_ADDRESS,
        transaction: {} as ValidationContext["transaction"],
        compiledMessage: {} as ValidationContext["compiledMessage"],
        decompiledMessage: {} as ValidationContext["decompiledMessage"],
    };
};

const createInstruction = (programAddress: Address, data: Uint8Array): Instruction => {
    return {
        programAddress,
        data,
        accounts: [],
    };
};

describe("createCustomProgramValidator", () => {
    const ctx = createMockContext();

    describe("discriminator matching", () => {
        it("should allow instruction with matching prefix", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                instructions: [{ discriminator: new Uint8Array([1, 2, 3, 4]) }],
            });

            const ix = createInstruction(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });

        it("should allow instruction when data exactly matches discriminator", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                instructions: [{ discriminator: new Uint8Array([1, 2, 3, 4]) }],
            });

            const ix = createInstruction(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4]));
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });

        it("should reject instruction when prefix does not match", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                instructions: [{ discriminator: new Uint8Array([1, 2, 3, 4]) }],
            });

            const ix = createInstruction(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 5, 6, 7]));
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("not in allowlist");
        });

        it("should reject instruction when data is shorter than discriminator", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                instructions: [{ discriminator: new Uint8Array([1, 2, 3, 4]) }],
            });

            const ix = createInstruction(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3]));
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("not in allowlist");
        });

        it("should allow instruction matching any of multiple rules", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                instructions: [
                    { discriminator: new Uint8Array([1, 0, 0, 0]) },
                    { discriminator: new Uint8Array([2, 0, 0, 0]) },
                    { discriminator: new Uint8Array([3, 0, 0, 0]) },
                ],
            });

            const ix1 = createInstruction(PROGRAM_ADDRESS, new Uint8Array([1, 0, 0, 0, 1, 2, 3]));
            const ix2 = createInstruction(PROGRAM_ADDRESS, new Uint8Array([2, 0, 0, 0, 4, 5, 6]));
            const ix3 = createInstruction(PROGRAM_ADDRESS, new Uint8Array([3, 0, 0, 0, 7, 8, 9]));

            expect(await policy.validate(ctx, ix1)).toBe(true);
            expect(await policy.validate(ctx, ix2)).toBe(true);
            expect(await policy.validate(ctx, ix3)).toBe(true);
        });

        it("should reject instruction not matching any rule", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                instructions: [
                    { discriminator: new Uint8Array([1, 0, 0, 0]) },
                    { discriminator: new Uint8Array([2, 0, 0, 0]) },
                ],
            });

            const ix = createInstruction(PROGRAM_ADDRESS, new Uint8Array([3, 0, 0, 0, 1, 2, 3]));
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("not in allowlist");
        });

        it("should support discriminators of different lengths", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                instructions: [
                    { discriminator: new Uint8Array([1]) }, // 1-byte
                    { discriminator: new Uint8Array([2, 0, 0, 0]) }, // 4-byte
                    { discriminator: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0]) }, // 8-byte Anchor style
                ],
            });

            // 1-byte match
            const ix1 = createInstruction(PROGRAM_ADDRESS, new Uint8Array([1, 99, 99, 99]));
            expect(await policy.validate(ctx, ix1)).toBe(true);

            // 4-byte match
            const ix2 = createInstruction(PROGRAM_ADDRESS, new Uint8Array([2, 0, 0, 0, 99, 99]));
            expect(await policy.validate(ctx, ix2)).toBe(true);

            // 8-byte match
            const ix3 = createInstruction(
                PROGRAM_ADDRESS,
                new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 99]),
            );
            expect(await policy.validate(ctx, ix3)).toBe(true);
        });
    });

    describe("validate callback", () => {
        it("should call validate callback when discriminator matches", async () => {
            let callbackCalled = false;
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                instructions: [
                    {
                        discriminator: new Uint8Array([1, 2, 3, 4]),
                        validate: (_ctx, _ix) => {
                            callbackCalled = true;
                            return true;
                        },
                    },
                ],
            });

            const ix = createInstruction(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4, 5, 6]));
            await policy.validate(ctx, ix);
            expect(callbackCalled).toBe(true);
        });

        it("should allow callback to reject instruction", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                instructions: [
                    {
                        discriminator: new Uint8Array([1, 2, 3, 4]),
                        validate: () => "Custom rejection reason",
                    },
                ],
            });

            const ix = createInstruction(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4, 5, 6]));
            const result = await policy.validate(ctx, ix);
            expect(result).toBe("Custom rejection reason");
        });

        it("should pass context and instruction to callback", async () => {
            let receivedCtx: ValidationContext | undefined;
            let receivedIx: Instruction | undefined;

            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                instructions: [
                    {
                        discriminator: new Uint8Array([1, 2, 3, 4]),
                        validate: (ctx, ix) => {
                            receivedCtx = ctx;
                            receivedIx = ix;
                            return true;
                        },
                    },
                ],
            });

            const ix = createInstruction(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4, 5, 6]));
            await policy.validate(ctx, ix);

            expect(receivedCtx).toBe(ctx);
            expect(receivedIx).toBe(ix);
        });

        it("should support async callbacks", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                instructions: [
                    {
                        discriminator: new Uint8Array([1, 2, 3, 4]),
                        validate: async () => {
                            await new Promise((resolve) => setTimeout(resolve, 1));
                            return true;
                        },
                    },
                ],
            });

            const ix = createInstruction(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4, 5, 6]));
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });
    });

    describe("program address validation", () => {
        it("should reject instruction from wrong program", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                instructions: [{ discriminator: new Uint8Array([1, 2, 3, 4]) }],
            });

            const ix = createInstruction(ANOTHER_PROGRAM, new Uint8Array([1, 2, 3, 4]));
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("Program address mismatch");
        });
    });

    describe("error messages", () => {
        it("should include discriminator preview in error message", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                instructions: [],
            });

            const ix = createInstruction(PROGRAM_ADDRESS, new Uint8Array([0xab, 0xcd, 0xef, 0x12]));
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("0xabcdef12");
        });

        it("should truncate long discriminators in error message", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                instructions: [],
            });

            const ix = createInstruction(
                PROGRAM_ADDRESS,
                new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
            );
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("...");
        });
    });

    describe("required configuration", () => {
        it("should set required to true", () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                instructions: [{ discriminator: new Uint8Array([1]) }],
                required: true,
            });

            expect(policy.required).toBe(true);
        });

        it("should set required to discriminator array", () => {
            const discriminator = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                instructions: [{ discriminator }],
                required: [discriminator],
            });

            expect(policy.required).toEqual([discriminator]);
        });
    });
});
