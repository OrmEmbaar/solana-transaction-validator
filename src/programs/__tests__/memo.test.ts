import { describe, it, expect } from "vitest";
import { createMemoValidator, MEMO_PROGRAM_ADDRESS, MemoInstruction } from "../memo.js";
import type { InstructionValidationContext } from "../../types.js";
import { address } from "@solana/kit";

// Valid base58 address
const SIGNER = address("11111111111111111111111111111112");

// Helper to create a mock instruction context
const createMockContext = (memoData: string): InstructionValidationContext => {
    const encoder = new TextEncoder();
    return {
        signer: SIGNER,
        transaction: {} as InstructionValidationContext["transaction"],
        decompiledMessage: {} as InstructionValidationContext["decompiledMessage"],
        instruction: {
            programAddress: MEMO_PROGRAM_ADDRESS,
            data: encoder.encode(memoData),
            accounts: [],
        } as InstructionValidationContext["instruction"],
        instructionIndex: 0,
    };
};

describe("createMemoValidator", () => {
    describe("instruction modes", () => {
        it("should deny when instruction is undefined (omitted)", async () => {
            const policy = createMemoValidator({
                instructions: {},
            });

            const ctx = createMockContext("test memo");
            const result = await policy.validate(ctx);
            expect(result).toBe("Memo: Memo instruction not allowed");
        });

        it("should deny when instruction is false", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: false,
                },
            });

            const ctx = createMockContext("test memo");
            const result = await policy.validate(ctx);
            expect(result).toBe("Memo: Memo instruction explicitly denied");
        });

        it("should allow when instruction is true", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: true,
                },
            });

            const ctx = createMockContext("test memo");
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });

        it("should use custom validator function", async () => {
            let validatorCalled = false;
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: async (ctx) => {
                        validatorCalled = true;
                        const decoder = new TextDecoder();
                        const memo = decoder.decode(ctx.instruction.data);
                        return memo.includes("approved") ? true : "Memo not approved";
                    },
                },
            });

            const ctx1 = createMockContext("this is approved");
            expect(await policy.validate(ctx1)).toBe(true);
            expect(validatorCalled).toBe(true);

            validatorCalled = false;
            const ctx2 = createMockContext("this is not good");
            expect(await policy.validate(ctx2)).toBe("Memo not approved");
            expect(validatorCalled).toBe(true);
        });
    });

    describe("maxLength validation", () => {
        it("should allow memo within length limit", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: {
                        maxLength: 100,
                    },
                },
            });

            const ctx = createMockContext("This is a short memo");
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });

        it("should allow memo at exact length limit", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: {
                        maxLength: 10,
                    },
                },
            });

            const ctx = createMockContext("1234567890");
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });

        it("should reject memo exceeding length limit", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: {
                        maxLength: 10,
                    },
                },
            });

            const ctx = createMockContext("12345678901");
            const result = await policy.validate(ctx);
            expect(result).toContain("Memo length");
            expect(result).toContain("exceeds limit");
            expect(result).toContain("11");
        });

        it("should allow empty memo when limit is set", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: {
                        maxLength: 100,
                    },
                },
            });

            const ctx = createMockContext("");
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });
    });

    describe("requiredPrefix validation", () => {
        it("should allow memo with required prefix", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: {
                        requiredPrefix: "app:",
                    },
                },
            });

            const ctx = createMockContext("app:user action");
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });

        it("should allow memo that is exactly the prefix", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: {
                        requiredPrefix: "app:",
                    },
                },
            });

            const ctx = createMockContext("app:");
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });

        it("should reject memo without required prefix", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: {
                        requiredPrefix: "app:",
                    },
                },
            });

            const ctx = createMockContext("user action");
            const result = await policy.validate(ctx);
            expect(result).toContain('must start with "app:"');
        });

        it("should reject memo with prefix in wrong position", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: {
                        requiredPrefix: "app:",
                    },
                },
            });

            const ctx = createMockContext("my app: user action");
            const result = await policy.validate(ctx);
            expect(result).toContain('must start with "app:"');
        });

        it("should be case-sensitive", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: {
                        requiredPrefix: "app:",
                    },
                },
            });

            const ctx = createMockContext("APP:user action");
            const result = await policy.validate(ctx);
            expect(result).toContain('must start with "app:"');
        });
    });

    describe("combined constraints", () => {
        it("should enforce both maxLength and requiredPrefix", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: {
                        maxLength: 20,
                        requiredPrefix: "app:",
                    },
                },
            });

            // Valid: has prefix and within length
            const ctx1 = createMockContext("app:short");
            expect(await policy.validate(ctx1)).toBe(true);

            // Invalid: too long
            const ctx2 = createMockContext("app:this memo is way too long");
            expect(await policy.validate(ctx2)).toContain("exceeds limit");

            // Invalid: no prefix
            const ctx3 = createMockContext("short");
            expect(await policy.validate(ctx3)).toContain("must start with");

            // Invalid: both issues (length checked first)
            const ctx4 = createMockContext("this memo is way too long and has no prefix");
            expect(await policy.validate(ctx4)).toContain("exceeds limit");
        });

        it("should allow memo with no constraints when config is empty object", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: {},
                },
            });

            const ctx = createMockContext("any memo of any length without prefix restrictions");
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });
    });

    describe("custom validators", () => {
        it("should run program-level custom validator after declarative validation", async () => {
            let customValidatorCalled = false;
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: {
                        maxLength: 100,
                    },
                },
                customValidator: () => {
                    customValidatorCalled = true;
                    return true;
                },
            });

            const ctx = createMockContext("test memo");
            await policy.validate(ctx);
            expect(customValidatorCalled).toBe(true);
        });

        it("should not run custom validator if declarative validation fails", async () => {
            let customValidatorCalled = false;
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: {
                        maxLength: 5,
                    },
                },
                customValidator: () => {
                    customValidatorCalled = true;
                    return true;
                },
            });

            const ctx = createMockContext("too long memo");
            await policy.validate(ctx);
            expect(customValidatorCalled).toBe(false);
        });

        it("should return custom validator error", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: {
                        maxLength: 100,
                    },
                },
                customValidator: () => "Custom validation failed",
            });

            const ctx = createMockContext("test memo");
            const result = await policy.validate(ctx);
            expect(result).toBe("Custom validation failed");
        });

        it("should run program-level validator after function-based instruction validator", async () => {
            let instructionValidatorCalled = false;
            let programValidatorCalled = false;

            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: () => {
                        instructionValidatorCalled = true;
                        return true;
                    },
                },
                customValidator: () => {
                    programValidatorCalled = true;
                    return true;
                },
            });

            const ctx = createMockContext("test");
            await policy.validate(ctx);
            expect(instructionValidatorCalled).toBe(true);
            expect(programValidatorCalled).toBe(true);
        });
    });

    describe("UTF-8 handling", () => {
        it("should handle multi-byte UTF-8 characters in length check", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: {
                        maxLength: 10,
                    },
                },
            });

            // Each emoji is typically 4 bytes
            const ctx = createMockContext("😀😀");
            const result = await policy.validate(ctx);
            // 8 bytes total, under 10 byte limit
            expect(result).toBe(true);
        });

        it("should handle UTF-8 characters in prefix check", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: {
                        requiredPrefix: "🚀:",
                    },
                },
            });

            const ctx = createMockContext("🚀:launch sequence");
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });
    });
});
