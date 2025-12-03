import type { ValidationContext, ValidationResult } from "../types.js";

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
}

/**
 * Validates transaction structural limits.
 *
 * @param config - The limits configuration
 * @param ctx - The validation context
 * @returns ValidationResult (true if allowed, string with reason if denied)
 */
export function validateTransactionLimits(
    config: TransactionLimitsConfig,
    ctx: ValidationContext,
): ValidationResult {
    const instructionCount = ctx.decompiledMessage.instructions.length;

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

    return true;
}
