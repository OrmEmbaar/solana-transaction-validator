import type { GlobalValidationContext, ValidationResult } from "../types.js";

/**
 * Configuration for transaction limits validation.
 */
export interface TransactionLimitsConfig {
    /**
     * Minimum number of instructions required.
     * @default 1 (prevents empty transactions)
     */
    minInstructions?: number;

    /**
     * Maximum number of instructions allowed.
     * @default undefined (no limit)
     */
    maxInstructions?: number;

    /**
     * Minimum number of signers required.
     * @default undefined (no minimum)
     */
    minSignatures?: number;

    /**
     * Maximum number of signers allowed.
     * @default undefined (no limit)
     */
    maxSignatures?: number;

    /**
     * Maximum total accounts in transaction (static + lookup).
     * @default undefined (no limit)
     */
    maxAccounts?: number;
}

/**
 * Calculates the total number of accounts in a transaction.
 * Includes both static accounts and accounts from address lookup tables.
 */
function getTotalAccountCount(ctx: GlobalValidationContext): number {
    // Static accounts
    let count = ctx.transaction.staticAccounts.length;

    // Add accounts from address lookup tables (v0 transactions only)
    if ("addressTableLookups" in ctx.transaction && ctx.transaction.addressTableLookups) {
        for (const lookup of ctx.transaction.addressTableLookups) {
            count += lookup.readonlyIndexes.length;
            count += lookup.writableIndexes.length;
        }
    }

    return count;
}

/**
 * Validates transaction structural limits.
 *
 * @param config - The limits configuration
 * @param ctx - The global policy context
 * @returns ValidationResult (true if allowed, string with reason if denied)
 */
export function validateTransactionLimits(
    config: TransactionLimitsConfig,
    ctx: GlobalValidationContext,
): ValidationResult {
    const instructionCount = ctx.decompiledMessage.instructions.length;
    const signerCount = ctx.transaction.header.numSignerAccounts;

    // Minimum instructions (default: 1 to prevent empty transactions)
    const minInstructions = config.minInstructions ?? 1;
    if (instructionCount < minInstructions) {
        if (minInstructions === 1 && instructionCount === 0) {
            return "Transaction cannot be empty (no instructions)";
        }
        return `Too few instructions: ${instructionCount} < ${minInstructions}`;
    }

    // Maximum instructions
    if (config.maxInstructions !== undefined && instructionCount > config.maxInstructions) {
        return `Too many instructions: ${instructionCount} > ${config.maxInstructions}`;
    }

    // Minimum signatures
    if (config.minSignatures !== undefined && signerCount < config.minSignatures) {
        return `Too few signatures: ${signerCount} < ${config.minSignatures}`;
    }

    // Maximum signatures
    if (config.maxSignatures !== undefined && signerCount > config.maxSignatures) {
        return `Too many signatures: ${signerCount} > ${config.maxSignatures}`;
    }

    // Maximum accounts
    if (config.maxAccounts !== undefined) {
        const totalAccounts = getTotalAccountCount(ctx);
        if (totalAccounts > config.maxAccounts) {
            return `Too many accounts: ${totalAccounts} > ${config.maxAccounts}`;
        }
    }

    return true;
}
