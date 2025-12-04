import { describe, it, expect } from "vitest";
import { arraysEqual, hasPrefix } from "../utils.js";

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
