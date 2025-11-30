import type { GlobalPolicyConfig, GlobalPolicyContext, PolicyResult } from "../types.js";
import { validateSignerRole } from "./signer-role.js";
import { validateTransactionLimits } from "./transaction-limits.js";

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

    return true;
}
