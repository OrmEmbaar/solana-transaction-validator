import { describe, it, expect } from "vitest";
import { arraysEqual, hasPrefix, composeValidators, runCustomValidator } from "../utils.js";
import type { InstructionPolicyContext } from "../../types.js";

describe("arraysEqual", () => {
    it("should return true for identical arrays", () => {
        const a = new Uint8Array([1, 2, 3, 4]);
        const b = new Uint8Array([1, 2, 3, 4]);
        expect(arraysEqual(a, b)).toBe(true);
    });

    it("should return true for empty arrays", () => {
        const a = new Uint8Array([]);
        const b = new Uint8Array([]);
        expect(arraysEqual(a, b)).toBe(true);
    });

    it("should return false for arrays of different lengths", () => {
        const a = new Uint8Array([1, 2, 3]);
        const b = new Uint8Array([1, 2, 3, 4]);
        expect(arraysEqual(a, b)).toBe(false);
    });

    it("should return false for arrays with different values", () => {
        const a = new Uint8Array([1, 2, 3, 4]);
        const b = new Uint8Array([1, 2, 3, 5]);
        expect(arraysEqual(a, b)).toBe(false);
    });

    it("should return false when first byte differs", () => {
        const a = new Uint8Array([0, 2, 3, 4]);
        const b = new Uint8Array([1, 2, 3, 4]);
        expect(arraysEqual(a, b)).toBe(false);
    });
});

describe("hasPrefix", () => {
    it("should return true when data starts with prefix", () => {
        const data = new Uint8Array([1, 2, 3, 4, 5]);
        const prefix = new Uint8Array([1, 2, 3]);
        expect(hasPrefix(data, prefix)).toBe(true);
    });

    it("should return true when data equals prefix exactly", () => {
        const data = new Uint8Array([1, 2, 3]);
        const prefix = new Uint8Array([1, 2, 3]);
        expect(hasPrefix(data, prefix)).toBe(true);
    });

    it("should return true for empty prefix", () => {
        const data = new Uint8Array([1, 2, 3]);
        const prefix = new Uint8Array([]);
        expect(hasPrefix(data, prefix)).toBe(true);
    });

    it("should return false when prefix is longer than data", () => {
        const data = new Uint8Array([1, 2]);
        const prefix = new Uint8Array([1, 2, 3]);
        expect(hasPrefix(data, prefix)).toBe(false);
    });

    it("should return false when prefix does not match", () => {
        const data = new Uint8Array([1, 2, 3, 4, 5]);
        const prefix = new Uint8Array([1, 2, 4]);
        expect(hasPrefix(data, prefix)).toBe(false);
    });

    it("should return false when first byte of prefix differs", () => {
        const data = new Uint8Array([1, 2, 3, 4, 5]);
        const prefix = new Uint8Array([0, 2, 3]);
        expect(hasPrefix(data, prefix)).toBe(false);
    });
});

describe("composeValidators", () => {
    const mockCtx = {} as InstructionPolicyContext;

    it("should return true when both validators pass", async () => {
        const first = () => true;
        const second = () => true;
        const composed = composeValidators(first, second);
        expect(await composed(mockCtx)).toBe(true);
    });

    it("should return first error when first validator fails", async () => {
        const first = () => "First validator failed";
        const second = () => true;
        const composed = composeValidators(first, second);
        expect(await composed(mockCtx)).toBe("First validator failed");
    });

    it("should return second error when first passes but second fails", async () => {
        const first = () => true;
        const second = () => "Second validator failed";
        const composed = composeValidators(first, second);
        expect(await composed(mockCtx)).toBe("Second validator failed");
    });

    it("should not call second validator if first fails", async () => {
        let secondCalled = false;
        const first = () => "First failed";
        const second = () => {
            secondCalled = true;
            return true;
        };
        const composed = composeValidators(first, second);
        await composed(mockCtx);
        expect(secondCalled).toBe(false);
    });

    it("should handle async validators", async () => {
        const first = async () => {
            await Promise.resolve();
            return true;
        };
        const second = async () => {
            await Promise.resolve();
            return "Async error";
        };
        const composed = composeValidators(first, second);
        expect(await composed(mockCtx)).toBe("Async error");
    });

    it("should handle false as rejection", async () => {
        const first = () => false;
        const second = () => true;
        const composed = composeValidators(first, second);
        expect(await composed(mockCtx)).toBe(false);
    });
});

describe("runCustomValidator", () => {
    const mockCtx = {} as InstructionPolicyContext;

    it("should return true when no validator provided", async () => {
        expect(await runCustomValidator(undefined, mockCtx)).toBe(true);
    });

    it("should run validator when provided", async () => {
        const validator = () => "Custom error";
        expect(await runCustomValidator(validator, mockCtx)).toBe("Custom error");
    });

    it("should handle async validator", async () => {
        const validator = async () => {
            await Promise.resolve();
            return true;
        };
        expect(await runCustomValidator(validator, mockCtx)).toBe(true);
    });
});
