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
        it("should allow instruction with exact match", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "exact" },
                ],
            });

            const ix = createInstruction(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4]));
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });

        it("should reject instruction when exact match fails due to extra bytes", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "exact" },
                ],
            });

            const ix = createInstruction(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4, 5]));
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("not in allowlist");
        });

        it("should allow instruction with prefix match", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "prefix" },
                ],
            });

            const ix = createInstruction(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });

        it("should allow instruction when prefix matches exactly", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "prefix" },
                ],
            });

            const ix = createInstruction(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4]));
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });

        it("should reject instruction when prefix does not match", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "prefix" },
                ],
            });

            const ix = createInstruction(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 5, 6, 7]));
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("not in allowlist");
        });

        it("should allow instruction matching any of multiple rules", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 0, 0, 0]), matchMode: "prefix" },
                    { discriminator: new Uint8Array([2, 0, 0, 0]), matchMode: "prefix" },
                    { discriminator: new Uint8Array([3, 0, 0, 0]), matchMode: "prefix" },
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
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 0, 0, 0]), matchMode: "prefix" },
                    { discriminator: new Uint8Array([2, 0, 0, 0]), matchMode: "prefix" },
                ],
            });

            const ix = createInstruction(PROGRAM_ADDRESS, new Uint8Array([3, 0, 0, 0, 1, 2, 3]));
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("not in allowlist");
        });

        it("should support mixed exact and prefix rules", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "exact" },
                    { discriminator: new Uint8Array([5, 6]), matchMode: "prefix" },
                ],
            });

            // Exact match
            const ix1 = createInstruction(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4]));
            expect(await policy.validate(ctx, ix1)).toBe(true);

            // Prefix match
            const ix2 = createInstruction(PROGRAM_ADDRESS, new Uint8Array([5, 6, 7, 8, 9]));
            expect(await policy.validate(ctx, ix2)).toBe(true);

            // Neither
            const ix3 = createInstruction(PROGRAM_ADDRESS, new Uint8Array([1, 2, 3, 4, 5]));
            expect(await policy.validate(ctx, ix3)).toContain("not in allowlist");
        });
    });

    describe("program address validation", () => {
        it("should reject instruction from wrong program", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [
                    { discriminator: new Uint8Array([1, 2, 3, 4]), matchMode: "prefix" },
                ],
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
                allowedInstructions: [],
            });

            const ix = createInstruction(PROGRAM_ADDRESS, new Uint8Array([0xab, 0xcd, 0xef, 0x12]));
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("0xabcdef12");
        });

        it("should truncate long discriminators in error message", async () => {
            const policy = createCustomProgramValidator({
                programAddress: PROGRAM_ADDRESS,
                allowedInstructions: [],
            });

            const ix = createInstruction(
                PROGRAM_ADDRESS,
                new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
            );
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("...");
        });
    });
});
