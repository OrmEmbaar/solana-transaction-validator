import type { ReadonlyUint8Array } from "@solana/kit";

/**
 * Check if two byte arrays are equal.
 *
 * @example
 * ```typescript
 * const a = new Uint8Array([1, 2, 3]);
 * const b = new Uint8Array([1, 2, 3]);
 * arraysEqual(a, b); // true
 * ```
 */
export function arraysEqual(a: ReadonlyUint8Array, b: ReadonlyUint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

/**
 * Check if a byte array starts with the given prefix.
 *
 * @example
 * ```typescript
 * const data = new Uint8Array([0x9a, 0x5c, 0x1b, 0x3d, 0x00, 0x01]);
 * const prefix = new Uint8Array([0x9a, 0x5c, 0x1b, 0x3d]);
 * hasPrefix(data, prefix); // true
 * ```
 */
export function hasPrefix(data: ReadonlyUint8Array, prefix: ReadonlyUint8Array): boolean {
    if (data.length < prefix.length) return false;
    for (let i = 0; i < prefix.length; i++) {
        if (data[i] !== prefix[i]) return false;
    }
    return true;
}
