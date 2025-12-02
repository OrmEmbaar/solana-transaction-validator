import type { ReadonlyUint8Array } from "@solana/kit";
import type {
    InstructionValidationContext,
    ValidationResult,
    CustomValidationCallback,
} from "../types.js";

// Re-export for convenience
export type { CustomValidationCallback };

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

/**
 * Compose two validators into one. Runs both validators in sequence.
 * Returns the first error encountered, or true if both pass.
 *
 * @example
 * ```typescript
 * const checkAmount: CustomValidationCallback = (ctx) => {
 *     // Check amount logic
 *     return true;
 * };
 *
 * const checkDestination: CustomValidationCallback = (ctx) => {
 *     // Check destination logic
 *     return true;
 * };
 *
 * const combined = composeValidators(checkAmount, checkDestination);
 * ```
 */
export function composeValidators<TProgramAddress extends string = string>(
    first: CustomValidationCallback<TProgramAddress>,
    second: CustomValidationCallback<TProgramAddress>,
): CustomValidationCallback<TProgramAddress> {
    return async (
        ctx: InstructionValidationContext<TProgramAddress>,
    ): Promise<ValidationResult> => {
        const firstResult = await first(ctx);
        if (firstResult !== true) return firstResult;
        return await second(ctx);
    };
}

/**
 * Helper to run a custom validator if provided.
 * Returns true if no validator is provided.
 *
 * @internal Used by program validators to run optional custom validators
 */
export async function runCustomValidator<TProgramAddress extends string = string>(
    validator: CustomValidationCallback<TProgramAddress> | undefined,
    ctx: InstructionValidationContext<TProgramAddress>,
): Promise<ValidationResult> {
    if (validator) {
        return await validator(ctx);
    }
    return true;
}
