import type { GlobalPolicyContext, PolicyResult } from "../types.js";

/**
 * Validates transaction structural limits.
 *
 * @param config - The limits configuration
 * @param ctx - The global policy context
 * @returns PolicyResult (true if allowed, string with reason if denied)
 */
export function validateTransactionLimits(
    config: {
        maxInstructions?: number;
        maxSignatures?: number;
    },
    ctx: GlobalPolicyContext,
): PolicyResult {
    if (config.maxInstructions && ctx.decompiledMessage.instructions.length > config.maxInstructions) {
        return `Too many instructions: ${ctx.decompiledMessage.instructions.length} > ${config.maxInstructions}`;
    }

    if (config.maxSignatures && ctx.transaction.header.numSignerAccounts > config.maxSignatures) {
        return `Too many signatures: ${ctx.transaction.header.numSignerAccounts} > ${config.maxSignatures}`;
    }

    return true;
}

