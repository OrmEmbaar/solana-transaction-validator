import type { ReadonlyUint8Array } from "@solana/kit";
import type { InstructionPolicyContext, PolicyResult } from "../types.js";

/**
 * Callback type for custom validation logic.
 */
export type CustomValidationCallback = (
    ctx: InstructionPolicyContext,
) => Promise<PolicyResult> | PolicyResult;

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
export function composeValidators(
    first: CustomValidationCallback,
    second: CustomValidationCallback,
): CustomValidationCallback {
    return async (ctx: InstructionPolicyContext): Promise<PolicyResult> => {
        const firstResult = await first(ctx);
        if (firstResult !== true) return firstResult;
        return await second(ctx);
    };
}

/**
 * Helper to run a custom validator if provided.
 */
export async function runCustomValidator(
    validator: CustomValidationCallback | undefined,
    ctx: InstructionPolicyContext,
): Promise<PolicyResult> {
    if (validator) {
        return await validator(ctx);
    }
    return true;
}

