import type { Address } from "@solana/kit";
import type { GlobalPolicyContext, PolicyResult } from "../types.js";

/**
 * Validates that the requesting signer is in the allowlist.
 *
 * @param allowedSigners - List of allowed signer addresses (undefined = any signer allowed)
 * @param ctx - The global policy context
 * @returns PolicyResult (true if allowed, string with reason if denied)
 */
export function validateSignerAllowlist(
    allowedSigners: Address[] | undefined,
    ctx: GlobalPolicyContext,
): PolicyResult {
    // If no allowlist is configured, any signer is allowed
    if (!allowedSigners || allowedSigners.length === 0) {
        return true;
    }

    if (!allowedSigners.includes(ctx.signer)) {
        return `Signer ${ctx.signer} is not in the allowed signers list`;
    }

    return true;
}

