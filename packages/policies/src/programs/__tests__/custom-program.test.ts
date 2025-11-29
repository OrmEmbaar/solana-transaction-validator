import { describe, it, expect } from "vitest";
import { createCustomProgramPolicy } from "../custom-program.js";
import type { InstructionPolicyContext } from "@solana-signer/shared";
import { address, type Address } from "@solana/kit";

// Use valid base58 addresses (44 chars for 32 bytes, no 0, O, I, l)
// System program is 11111111111111111111111111111111 (32 ones)
const PROGRAM_ADDRESS = address("11111111111111111111111111111112");
const ANOTHER_PROGRAM = address("11111111111111111111111111111113");
const SIGNER_ADDRESS = address("11111111111111111111111111111114");

const createMockContext = (
    programAddress: Address,
    data: Uint8Array,
): InstructionPolicyContext => {
    return {
        signer: SIGNER_ADDRESS,
        transaction: {} as InstructionPolicyContext["transaction"],
        decompiledMessage: {} as InstructionPolicyContext["decompiledMessage"],
        instruction: {
            programAddress,
            data,
            accounts: [],
        },
        instructionIndex: 0,
    };
};

describe("createCustomProgramPolicy", () => {
    describe("discriminator matching", () => {
        it("should allow instruction with exact match", async () => {
            const policy = createCustomProgramPolicy({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "exact" },
                ],
            });

            const ctx = createMockContext(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4]));
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });

        it("should reject instruction when exact match fails due to extra bytes", async () => {
            const policy = createCustomProgramPolicy({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "exact" },
                ],
            });

            const ctx = createMockContext(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4, 5]));
            const result = await policy.validate(ctx);
            expect(result).toContain("not in allowlist");
        });

        it("should allow instruction with prefix match", async () => {
            const policy = createCustomProgramPolicy({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "prefix" },
                ],
            });

            const ctx = createMockContext(
                PROGRAM_ADDRESS,
                new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
            );
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });

        it("should allow instruction when prefix matches exactly", async () => {
            const policy = createCustomProgramPolicy({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "prefix" },
                ],
            });

            const ctx = createMockContext(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4]));
            const result = await policy.validate(ctx);
            expect(result).toBe(true);
        });

        it("should reject instruction when prefix does not match", async () => {
            const policy = createCustomProgramPolicy({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "prefix" },
                ],
            });

            const ctx = createMockContext(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 5, 6, 7]));
            const result = await policy.validate(ctx);
            expect(result).toContain("not in allowlist");
        });

        it("should allow instruction matching any of multiple rules", async () => {
            const policy = createCustomProgramPolicy({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 0, 0, 0]), matchMode: "prefix" },
                    { discriminator: new Uint8Array([2, 0, 0, 0]), matchMode: "prefix" },
                    { discriminator: new Uint8Array([3, 0, 0, 0]), matchMode: "prefix" },
                ],
            });

            const ctx1 = createMockContext(PROGRAM_ADDRESS, new Uint8Array([1, 0, 0, 0, 1, 2, 3]));
            const ctx2 = createMockContext(PROGRAM_ADDRESS, new Uint8Array([2, 0, 0, 0, 4, 5, 6]));
            const ctx3 = createMockContext(PROGRAM_ADDRESS, new Uint8Array([3, 0, 0, 0, 7, 8, 9]));

            expect(await policy.validate(ctx1)).toBe(true);
            expect(await policy.validate(ctx2)).toBe(true);
            expect(await policy.validate(ctx3)).toBe(true);
        });

        it("should reject instruction not matching any rule", async () => {
            const policy = createCustomProgramPolicy({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 0, 0, 0]), matchMode: "prefix" },
                    { discriminator: new Uint8Array([2, 0, 0, 0]), matchMode: "prefix" },
                ],
            });

            const ctx = createMockContext(PROGRAM_ADDRESS, new Uint8Array([3, 0, 0, 0, 1, 2, 3]));
            const result = await policy.validate(ctx);
            expect(result).toContain("not in allowlist");
        });

        it("should support mixed exact and prefix rules", async () => {
            const policy = createCustomProgramPolicy({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "exact" },
                    { discriminator: new Uint8Array([5, 6]), matchMode: "prefix" },
                ],
            });

            // Exact match
            const ctx1 = createMockContext(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4]));
            expect(await policy.validate(ctx1)).toBe(true);

            // Prefix match
            const ctx2 = createMockContext(PROGRAM_ADDRESS, new Uint8Array([5, 6, 7, 8, 9]));
            expect(await policy.validate(ctx2)).toBe(true);

            // Neither
            const ctx3 = createMockContext(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4, 5]));
            expect(await policy.validate(ctx3)).toContain("not in allowlist");
        });
    });

    describe("program address validation", () => {
        it("should reject instruction from wrong program", async () => {
            const policy = createCustomProgramPolicy({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "prefix" },
                ],
            });

            const ctx = createMockContext(ANOTHER_PROGRAM, new Uint8Array([1, 2, 3, 4]));
            const result = await policy.validate(ctx);
            expect(result).toContain("Program address mismatch");
        });
    });

    describe("custom validator", () => {
        it("should run custom validator after discriminator check passes", async () => {
            let validatorCalled = false;
            const policy = createCustomProgramPolicy({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "prefix" },
                ],
                customValidator: () => {
                    validatorCalled = true;
                    return true;
                },
            });

            const ctx = createMockContext(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4, 5, 6]));
            await policy.validate(ctx);
            expect(validatorCalled).toBe(true);
        });

        it("should not run custom validator if discriminator check fails", async () => {
            let validatorCalled = false;
            const policy = createCustomProgramPolicy({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "prefix" },
                ],
                customValidator: () => {
                    validatorCalled = true;
                    return true;
                },
            });

            const ctx = createMockContext(PROGRAM_ADDRESS, new Uint8Array([9, 9, 9, 9]));
            await policy.validate(ctx);
            expect(validatorCalled).toBe(false);
        });

        it("should return custom validator error", async () => {
            const policy = createCustomProgramPolicy({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "prefix" },
                ],
                customValidator: () => "Custom validation failed: amount too high",
            });

            const ctx = createMockContext(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4, 5, 6]));
            const result = await policy.validate(ctx);
            expect(result).toBe("Custom validation failed: amount too high");
        });

        it("should handle async custom validator", async () => {
            const policy = createCustomProgramPolicy({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "prefix" },
                ],
                customValidator: async () => {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    return "Async validation failed";
                },
            });

            const ctx = createMockContext(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4, 5, 6]));
            const result = await policy.validate(ctx);
            expect(result).toBe("Async validation failed");
        });

        it("should pass context to custom validator", async () => {
            let receivedCtx: InstructionPolicyContext | null = null;
            const policy = createCustomProgramPolicy({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "prefix" },
                ],
                customValidator: (ctx) => {
                    receivedCtx = ctx;
                    return true;
                },
            });

            const ctx = createMockContext(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4, 5, 6]));
            await policy.validate(ctx);
            expect(receivedCtx).toBe(ctx);
        });
    });

    describe("error messages", () => {
        it("should include discriminator preview in error message", async () => {
            const policy = createCustomProgramPolicy({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [],
            });

            const ctx = createMockContext(PROGRAM_ADDRESS, new Uint8Array([0xab, 0xcd, 0xef, 0x12]));
            const result = await policy.validate(ctx);
            expect(result).toContain("0xabcdef12");
        });

        it("should truncate long discriminators in error message", async () => {
            const policy = createCustomProgramPolicy({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [],
            });

            const ctx = createMockContext(
                PROGRAM_ADDRESS,
                new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
            );
            const result = await policy.validate(ctx);
            expect(result).toContain("...");
        });
    });
});
