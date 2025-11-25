import type { GlobalPolicyConfig, GlobalPolicyContext, PolicyResult } from "@solana-signer/shared";
import { validateSignerRole } from "./validators/signer-role.js";
import { validateTransactionLimits } from "./validators/transaction-limits.js";

/**
 * Validates the global policy configuration for a signing request.
 *
 * @param config - The global policy configuration
 * @param ctx - The global policy context
 * @returns PolicyResult (true if allowed, string with reason if denied)
 */
export function validateGlobalPolicy(
    config: GlobalPolicyConfig,
    ctx: GlobalPolicyContext,
): PolicyResult {
    // 1. Validate Signer Role (REQUIRED)
    const roleResult = validateSignerRole(config.signerRole, ctx);
    if (roleResult !== true) return roleResult;

    // 2. Validate Transaction Limits
    const limitsResult = validateTransactionLimits(config, ctx);
    if (limitsResult !== true) return limitsResult;

    // TODO: Implement additional global validations:
    // - maxSolOutflowLamports (requires simulation)
    // - maxTokenOutflowByMint (requires simulation)
    // - forbidAccountClosure
    // - forbidAuthorityChanges

    return true;
}
