import type { GlobalPolicyContext, PolicyResult } from "../types.js";

/**
 * Transaction version type.
 */
export type TransactionVersion = 0 | "legacy";

/**
 * Detects the transaction version from a compiled transaction message.
 *
 * - v0 transactions have `addressTableLookups` property (even if empty array)
 * - Legacy transactions do not have this property at all
 *
 * @param ctx - The global policy context
 * @returns The detected transaction version
 */
export function detectTransactionVersion(ctx: GlobalPolicyContext): TransactionVersion {
    // v0 transactions have addressTableLookups property defined
    // Legacy transactions don't have this property at all
    return "addressTableLookups" in ctx.transaction ? 0 : "legacy";
}

/**
 * Validates that the transaction version is allowed.
 *
 * @param allowedVersions - List of allowed versions (default: [0])
 * @param ctx - The global policy context
 * @returns PolicyResult (true if allowed, string with reason if denied)
 */
export function validateTransactionVersion(
    allowedVersions: TransactionVersion[] | undefined,
    ctx: GlobalPolicyContext,
): PolicyResult {
    // Default: Only v0 transactions allowed (modern standard)
    const versions = allowedVersions ?? [0];

    const detectedVersion = detectTransactionVersion(ctx);

    if (!versions.includes(detectedVersion)) {
        const versionStr = detectedVersion === 0 ? "v0" : "legacy";
        const allowedStr = versions.map((v) => (v === 0 ? "v0" : "legacy")).join(", ");
        return `Transaction version ${versionStr} is not allowed. Allowed versions: ${allowedStr}`;
    }

    return true;
}

