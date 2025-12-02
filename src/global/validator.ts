import type { GlobalPolicyConfig, GlobalValidationContext, ValidationResult } from "../types.js";
import { validateSignerAllowlist } from "./signer-allowlist.js";
import { validateSignerRole } from "./signer-role.js";
import { validateTransactionLimits } from "./transaction-limits.js";
import { validateTransactionVersion } from "./version-validation.js";
import { validateAddressLookups } from "./address-lookup-validation.js";

/**
 * Validates the global policy configuration for a signing request.
 *
 * Validation order:
 * 1. Transaction version (default: v0 only)
 * 2. Address lookup tables (default: deny all)
 * 3. Signer allowlist (default: any signer)
 * 4. Signer role (REQUIRED)
 * 5. Transaction limits (default: minInstructions=1)
 *
 * @param config - The global policy configuration
 * @param ctx - The global policy context
 * @returns ValidationResult (true if allowed, string with reason if denied)
 */
export function validateGlobalPolicy(
    config: GlobalPolicyConfig,
    ctx: GlobalValidationContext,
): ValidationResult {
    const versionResult = validateTransactionVersion(config.allowedVersions, ctx);
    if (versionResult !== true) return versionResult;

    const altResult = validateAddressLookups(config.addressLookupTables, ctx);
    if (altResult !== true) return altResult;

    const allowlistResult = validateSignerAllowlist(config.allowedSigners, ctx);
    if (allowlistResult !== true) return allowlistResult;

    const roleResult = validateSignerRole(config.signerRole, ctx);
    if (roleResult !== true) return roleResult;

    const limitsResult = validateTransactionLimits(config, ctx);
    if (limitsResult !== true) return limitsResult;

    return true;
}
