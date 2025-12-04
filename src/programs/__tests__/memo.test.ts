import { describe, it, expect } from "vitest";
import { createMemoValidator, MEMO_PROGRAM_ADDRESS, MemoInstruction } from "../memo.js";
import type { ValidationContext } from "../../types.js";
import { address, type Instruction } from "@solana/kit";

// Valid base58 address
const SIGNER = address("11111111111111111111111111111112");

// Helper to create a mock validation context (without instruction - that's passed separately)
const createMockContext = (): ValidationContext => {
    return {
        signer: SIGNER,
        transaction: {} as ValidationContext["transaction"],
        compiledMessage: {} as ValidationContext["compiledMessage"],
        decompiledMessage: {} as ValidationContext["decompiledMessage"],
    };
};

// Helper to create a memo instruction
const createMemoInstruction = (memoData: string): Instruction => {
    const encoder = new TextEncoder();
    return {
        programAddress: MEMO_PROGRAM_ADDRESS,
        data: encoder.encode(memoData),
        accounts: [],
    };
};

describe("createMemoValidator", () => {
    const ctx = createMockContext();

    describe("instruction modes", () => {
        it("should deny when instruction is undefined (omitted)", async () => {
            const policy = createMemoValidator({
                instructions: {},
            });

            const ix = createMemoInstruction("test memo");
            const result = await policy.validate(ctx, ix);
            expect(result).toBe("Memo: Memo instruction not allowed");
        });

        it("should deny when instruction is false", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: false,
                },
            });

            const ix = createMemoInstruction("test memo");
            const result = await policy.validate(ctx, ix);
            expect(result).toBe("Memo: Memo instruction explicitly denied");
        });

        it("should allow when instruction is true", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: true,
                },
            });

            const ix = createMemoInstruction("test memo");
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });

        it("should use custom validator function", async () => {
            let validatorCalled = false;
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: async (_ctx, parsed) => {
                        validatorCalled = true;
                        return parsed.text.includes("approved") ? true : "Memo not approved";
                    },
                },
            });

            const ix1 = createMemoInstruction("this is approved");
            expect(await policy.validate(ctx, ix1)).toBe(true);
            expect(validatorCalled).toBe(true);

            validatorCalled = false;
            const ix2 = createMemoInstruction("this is not good");
            expect(await policy.validate(ctx, ix2)).toBe("Memo not approved");
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

            const ix = createMemoInstruction("This is a short memo");
            const result = await policy.validate(ctx, ix);
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

            const ix = createMemoInstruction("1234567890");
            const result = await policy.validate(ctx, ix);
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

            const ix = createMemoInstruction("12345678901");
            const result = await policy.validate(ctx, ix);
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

            const ix = createMemoInstruction("");
            const result = await policy.validate(ctx, ix);
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

            const ix = createMemoInstruction("app:user action");
            const result = await policy.validate(ctx, ix);
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

            const ix = createMemoInstruction("app:");
            const result = await policy.validate(ctx, ix);
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

            const ix = createMemoInstruction("user action");
            const result = await policy.validate(ctx, ix);
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

            const ix = createMemoInstruction("my app: user action");
            const result = await policy.validate(ctx, ix);
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

            const ix = createMemoInstruction("APP:user action");
            const result = await policy.validate(ctx, ix);
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
            const ix1 = createMemoInstruction("app:short");
            expect(await policy.validate(ctx, ix1)).toBe(true);

            // Invalid: too long
            const ix2 = createMemoInstruction("app:this memo is way too long");
            expect(await policy.validate(ctx, ix2)).toContain("exceeds limit");

            // Invalid: no prefix
            const ix3 = createMemoInstruction("short");
            expect(await policy.validate(ctx, ix3)).toContain("must start with");

            // Invalid: both issues (length checked first)
            const ix4 = createMemoInstruction("this memo is way too long and has no prefix");
            expect(await policy.validate(ctx, ix4)).toContain("exceeds limit");
        });

        it("should allow memo with no constraints when config is empty object", async () => {
            const policy = createMemoValidator({
                instructions: {
                    [MemoInstruction.Memo]: {},
                },
            });

            const ix = createMemoInstruction("any memo of any length without prefix restrictions");
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
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
            const ix = createMemoInstruction("😀😀");
            const result = await policy.validate(ctx, ix);
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

            const ix = createMemoInstruction("🚀:launch sequence");
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });
    });
});
