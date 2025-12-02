import type { TransactionVersion } from "@solana/kit";
import type { GlobalValidationContext, ValidationResult } from "../types.js";

/**
 * Validates that the transaction version is allowed.
 *
 * @param allowedVersions - List of allowed versions (default: [0] for v0 only)
 * @param ctx - The global policy context
 * @returns ValidationResult (true if allowed, string with reason if denied)
 */
export function validateTransactionVersion(
    allowedVersions: readonly TransactionVersion[] = [0],
    ctx: GlobalValidationContext,
): ValidationResult {
    if (!allowedVersions.includes(ctx.transaction.version)) {
        const allowed = allowedVersions.join(", ");
        return `Transaction version ${ctx.transaction.version} is not allowed. Allowed: [${allowed}]`;
    }

    return true;
}
