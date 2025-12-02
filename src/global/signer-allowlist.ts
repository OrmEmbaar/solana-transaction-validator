import type { Address } from "@solana/kit";
import type { GlobalValidationContext, ValidationResult } from "../types.js";

/**
 * Validates that the requesting signer is in the allowlist.
 *
 * @param allowedSigners - List of allowed signer addresses (undefined = any signer allowed)
 * @param ctx - The global policy context
 * @returns ValidationResult (true if allowed, string with reason if denied)
 */
export function validateSignerAllowlist(
    allowedSigners: Address[] | undefined,
    ctx: GlobalValidationContext,
): ValidationResult {
    // If no allowlist is configured, any signer is allowed
    if (!allowedSigners || allowedSigners.length === 0) {
        return true;
    }

    if (!allowedSigners.includes(ctx.signer)) {
        return `Signer ${ctx.signer} is not in the allowed signers list`;
    }

    return true;
}
