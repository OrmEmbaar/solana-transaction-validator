import type { Address } from "@solana/kit";
import type { GlobalValidationContext, ValidationResult } from "../types.js";

/**
 * Configuration for address lookup table validation.
 */
export interface AddressLookupConfig {
    /**
     * Allowlist of trusted lookup table addresses.
     * If specified, only these tables are allowed.
     */
    allowedTables?: Address[];

    /**
     * Maximum number of lookup tables per transaction.
     * @default undefined (no limit)
     */
    maxTables?: number;

    /**
     * Maximum total accounts indexed across all lookups.
     * @default undefined (no limit)
     */
    maxIndexedAccounts?: number;
}

/**
 * Validates address lookup table constraints.
 *
 * Default behavior (undefined): DENY all lookup tables (secure by default)
 *
 * @param config - The lookup table configuration
 *   - undefined: deny all lookup tables (default, secure)
 *   - false: explicitly deny all lookup tables (self-documenting)
 *   - true: allow any lookup tables without validation (opt-out)
 *   - AddressLookupConfig: allow with declarative constraints
 * @param ctx - The global policy context
 * @returns ValidationResult (true if allowed, string with reason if denied)
 */
export function validateAddressLookups(
    config: boolean | AddressLookupConfig | undefined,
    ctx: GlobalValidationContext,
): ValidationResult {
    // Only v0 transactions have lookup tables
    // Use version check for type narrowing
    if (ctx.transaction.version !== 0) {
        return true; // Legacy transactions don't support lookup tables
    }

    // Type is now narrowed - safe to access addressTableLookups
    const lookups = ctx.transaction.addressTableLookups || [];

    // No lookups present - always allowed
    if (lookups.length === 0) {
        return true;
    }

    // Default (undefined) or explicit false: deny all
    if (config === undefined || config === false) {
        return "Address lookup tables are not allowed (secure by default)";
    }

    // Explicit true: allow any lookups
    if (config === true) {
        return true;
    }

    // Config object: validate constraints
    const altConfig = config;

    // Max tables check
    if (altConfig.maxTables !== undefined && lookups.length > altConfig.maxTables) {
        return `Too many lookup tables: ${lookups.length} > ${altConfig.maxTables}`;
    }

    // Validate table addresses against allowlist
    if (altConfig.allowedTables !== undefined) {
        for (const lookup of lookups) {
            if (!altConfig.allowedTables.includes(lookup.lookupTableAddress)) {
                return `Lookup table ${lookup.lookupTableAddress} is not in allowlist`;
            }
        }
    }

    // Max indexed accounts check
    if (altConfig.maxIndexedAccounts !== undefined) {
        const totalIndexed = lookups.reduce(
            (sum, lookup) => sum + lookup.readonlyIndexes.length + lookup.writableIndexes.length,
            0,
        );
        if (totalIndexed > altConfig.maxIndexedAccounts) {
            return `Too many indexed accounts in lookups: ${totalIndexed} > ${altConfig.maxIndexedAccounts}`;
        }
    }

    return true;
}
