import type { ReadonlyUint8Array } from "@solana/kit";
import type {
    InstructionPolicyContext,
    PolicyResult,
    CustomValidationCallback,
} from "../types.js";

// Re-export for convenience
export type { CustomValidationCallback };

/**
 * Check if two byte arrays are equal.
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
 */
export function composeValidators<TProgramAddress extends string = string>(
    first: CustomValidationCallback<TProgramAddress>,
    second: CustomValidationCallback<TProgramAddress>,
): CustomValidationCallback<TProgramAddress> {
    return async (ctx: InstructionPolicyContext<TProgramAddress>): Promise<PolicyResult> => {
        const firstResult = await first(ctx);
        if (firstResult !== true) return firstResult;
        return await second(ctx);
    };
}

/**
 * Helper to run a custom validator if provided.
 */
export async function runCustomValidator<TProgramAddress extends string = string>(
    validator: CustomValidationCallback<TProgramAddress> | undefined,
    ctx: InstructionPolicyContext<TProgramAddress>,
): Promise<PolicyResult> {
    if (validator) {
        return await validator(ctx);
    }
    return true;
}

