import { describe, it, expect } from "vitest";
import { createComputeBudgetValidator, ComputeBudgetInstruction } from "../compute-budget.js";
import type { InstructionValidationContext } from "../../types.js";
import { address, type Instruction } from "@solana/kit";
import {
    getSetComputeUnitLimitInstruction,
    getSetComputeUnitPriceInstruction,
    getRequestHeapFrameInstruction,
    getSetLoadedAccountsDataSizeLimitInstruction,
} from "@solana-program/compute-budget";

// Valid base58 address
const SIGNER = address("11111111111111111111111111111112");

// Helper to create a mock instruction context
const createMockContext = (instruction: Instruction): InstructionValidationContext => {
    return {
        signer: SIGNER,
        transaction: {} as InstructionValidationContext["transaction"],
        compiledMessage: {} as InstructionValidationContext["compiledMessage"],
        decompiledMessage: {} as InstructionValidationContext["decompiledMessage"],
        instruction: instruction as InstructionValidationContext["instruction"],
        instructionIndex: 0,
    };
};

describe("createComputeBudgetValidator", () => {
    describe("instruction allowlist", () => {
        it("should deny instruction when not in config", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {},
            });

            const ix = getSetComputeUnitLimitInstruction({ units: 200_000 });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("SetComputeUnitLimit instruction not allowed");
        });

        it("should explicitly deny instruction when set to false", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.SetComputeUnitLimit]: false,
                },
            });

            const ix = getSetComputeUnitLimitInstruction({ units: 200_000 });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("explicitly denied");
        });

        it("should allow instruction when set to true", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.SetComputeUnitLimit]: true,
                },
            });

            const ix = getSetComputeUnitLimitInstruction({ units: 200_000 });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should allow instruction with custom validator function", async () => {
            let validatorCalled = false;
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.SetComputeUnitLimit]: async () => {
                        validatorCalled = true;
                        return true;
                    },
                },
            });

            const ix = getSetComputeUnitLimitInstruction({ units: 200_000 });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
            expect(validatorCalled).toBe(true);
        });
    });

    describe("SetComputeUnitLimit validation", () => {
        it("should allow units within limit", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.SetComputeUnitLimit]: {
                        maxUnits: 1_400_000,
                    },
                },
            });

            const ix = getSetComputeUnitLimitInstruction({ units: 800_000 });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should allow units at exact limit", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.SetComputeUnitLimit]: {
                        maxUnits: 1_400_000,
                    },
                },
            });

            const ix = getSetComputeUnitLimitInstruction({ units: 1_400_000 });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject units exceeding limit", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.SetComputeUnitLimit]: {
                        maxUnits: 1_400_000,
                    },
                },
            });

            const ix = getSetComputeUnitLimitInstruction({ units: 2_000_000 });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("exceeds limit");
            expect(result).toContain("2000000");
        });

        it("should allow units when no constraint specified", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.SetComputeUnitLimit]: {},
                },
            });

            const ix = getSetComputeUnitLimitInstruction({ units: 5_000_000 });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });
    });

    describe("SetComputeUnitPrice validation", () => {
        it("should allow price within limit", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.SetComputeUnitPrice]: {
                        maxMicroLamportsPerCu: 1_000_000n,
                    },
                },
            });

            const ix = getSetComputeUnitPriceInstruction({ microLamports: 500_000n });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should allow price at exact limit", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.SetComputeUnitPrice]: {
                        maxMicroLamportsPerCu: 1_000_000n,
                    },
                },
            });

            const ix = getSetComputeUnitPriceInstruction({ microLamports: 1_000_000n });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject price exceeding limit", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.SetComputeUnitPrice]: {
                        maxMicroLamportsPerCu: 1_000_000n,
                    },
                },
            });

            const ix = getSetComputeUnitPriceInstruction({ microLamports: 2_000_000n });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("exceeds limit");
            expect(result).toContain("2000000");
        });

        it("should allow price when no constraint specified", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.SetComputeUnitPrice]: {},
                },
            });

            const ix = getSetComputeUnitPriceInstruction({ microLamports: 10_000_000n });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });
    });

    describe("RequestHeapFrame validation", () => {
        it("should allow bytes within limit", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.RequestHeapFrame]: {
                        maxBytes: 256_000,
                    },
                },
            });

            const ix = getRequestHeapFrameInstruction({ bytes: 128_000 });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should allow bytes at exact limit", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.RequestHeapFrame]: {
                        maxBytes: 256_000,
                    },
                },
            });

            const ix = getRequestHeapFrameInstruction({ bytes: 256_000 });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject bytes exceeding limit", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.RequestHeapFrame]: {
                        maxBytes: 256_000,
                    },
                },
            });

            const ix = getRequestHeapFrameInstruction({ bytes: 512_000 });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("exceeds limit");
            expect(result).toContain("512000");
        });

        it("should allow bytes when no constraint specified", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.RequestHeapFrame]: {},
                },
            });

            const ix = getRequestHeapFrameInstruction({ bytes: 1_000_000 });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });
    });

    describe("SetLoadedAccountsDataSizeLimit validation", () => {
        it("should allow bytes within limit", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.SetLoadedAccountsDataSizeLimit]: {
                        maxBytes: 65_536,
                    },
                },
            });

            const ix = getSetLoadedAccountsDataSizeLimitInstruction({
                accountDataSizeLimit: 32_768,
            });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject bytes exceeding limit", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.SetLoadedAccountsDataSizeLimit]: {
                        maxBytes: 65_536,
                    },
                },
            });

            const ix = getSetLoadedAccountsDataSizeLimitInstruction({
                accountDataSizeLimit: 100_000,
            });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("exceeds limit");
            expect(result).toContain("100000");
        });
    });

    describe("custom validators", () => {
        it("should run program-level custom validator", async () => {
            let customValidatorCalled = false;
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.SetComputeUnitLimit]: {
                        maxUnits: 1_400_000,
                    },
                },
                customValidator: () => {
                    customValidatorCalled = true;
                    return true;
                },
            });

            const ix = getSetComputeUnitLimitInstruction({ units: 800_000 });
            await policy.validate(createMockContext(ix));
            expect(customValidatorCalled).toBe(true);
        });

        it("should not run custom validator if validation fails", async () => {
            let customValidatorCalled = false;
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.SetComputeUnitLimit]: {
                        maxUnits: 1_400_000,
                    },
                },
                customValidator: () => {
                    customValidatorCalled = true;
                    return true;
                },
            });

            const ix = getSetComputeUnitLimitInstruction({ units: 2_000_000 });
            await policy.validate(createMockContext(ix));
            expect(customValidatorCalled).toBe(false);
        });

        it("should return custom validator error", async () => {
            const policy = createComputeBudgetValidator({
                instructions: {
                    [ComputeBudgetInstruction.SetComputeUnitLimit]: true,
                },
                customValidator: () => "Custom validation failed",
            });

            const ix = getSetComputeUnitLimitInstruction({ units: 200_000 });
            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe("Custom validation failed");
        });
    });
});
