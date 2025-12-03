import type { GlobalPolicyConfig, ValidationContext, ValidationResult } from "../types.js";
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
 * 3. Signer role (REQUIRED)
 * 4. Transaction limits (default: minInstructions=1)
 *
 * @param config - The global policy configuration
 * @param ctx - The validation context
 * @returns ValidationResult (true if allowed, string with reason if denied)
 */
export function validateGlobalPolicy(
    config: GlobalPolicyConfig,
    ctx: ValidationContext,
): ValidationResult {
    const versionResult = validateTransactionVersion(config.allowedVersions, ctx);
    if (versionResult !== true) return versionResult;

    const altResult = validateAddressLookups(config.addressLookupTables, ctx);
    if (altResult !== true) return altResult;

    const roleResult = validateSignerRole(config.signerRole, ctx);
    if (roleResult !== true) return roleResult;

    const limitsResult = validateTransactionLimits(config, ctx);
    if (limitsResult !== true) return limitsResult;

    return true;
}
