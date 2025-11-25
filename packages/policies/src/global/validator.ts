import type {
    GlobalPolicyContext,
    GlobalPolicyConfig,
    PolicyResult,
    SignerRole,
} from "@solana-signer/shared";

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
    if (
        config.maxInstructions &&
        ctx.decompiledMessage.instructions.length > config.maxInstructions
    ) {
        return `Too many instructions: ${ctx.decompiledMessage.instructions.length} > ${config.maxInstructions}`;
    }

    if (config.maxSignatures && ctx.transaction.header.numSignerAccounts > config.maxSignatures) {
        return `Too many signatures: ${ctx.transaction.header.numSignerAccounts} > ${config.maxSignatures}`;
    }

    // TODO: Implement additional global validations:
    // - maxSolOutflowLamports (requires simulation)
    // - maxTokenOutflowByMint (requires simulation)
    // - forbidAccountClosure
    // - forbidAuthorityChanges

    return true;
}

/**
 * Validates the signer's role in the transaction.
 *
 * NOTE: Currently only validates basic signer role constraints.
 * Full participant detection requires proper type handling for AccountMeta.
 * This will be enhanced once we have better type information from @solana/kit.
 */
function validateSignerRole(role: SignerRole, ctx: GlobalPolicyContext): PolicyResult {
    // TODO: Implement full validation once we resolve the AccountMeta type issue
    // For now, we only validate the most basic constraint

    // The decompiledMessage.feePayer type is complex in Kit (might be { address: Address })
    // We'll revisit this once we have working examples or better type info

    // For now, accept all roles (the stub in server-core does the same)
    // This will be properly implemented in a follow-up
    return true;
}
