import { decompileTransactionMessage } from "@solana/kit";
import type {
    Address,
    CompiledTransactionMessage,
    CompiledTransactionMessageWithLifetime,
} from "@solana/kit";
import type {
    BasePolicyContext,
    GlobalPolicyConfig,
    GlobalPolicyContext,
    InstructionPolicy,
    InstructionPolicyContext,
    PolicyResult,
} from "./types.js";
import { RemoteSignerError, SignerErrorCode } from "./errors.js";

export interface PolicyEngineConfig {
    /** Global constraints applied to all transactions (REQUIRED) */
    global: GlobalPolicyConfig;
    /** Map of Program ID -> Policy for instruction-level validation */
    programs?: Record<Address, InstructionPolicy>;
}

/**
 * A function that validates a transaction against the configured policies.
 * Throws RemoteSignerError if validation fails.
 */
export type TransactionValidator = (
    transaction: CompiledTransactionMessage & CompiledTransactionMessageWithLifetime,
    baseContext: BasePolicyContext,
) => Promise<void>;

/**
 * Creates a validation function that enforces the configured policies.
 *
 * @param config - The policy configuration
 * @returns A validation function that can be reused for multiple requests
 */
export function createPolicyValidator(config: PolicyEngineConfig): TransactionValidator {
    const programPolicies = config.programs ?? {};

    return async function validateTransaction(
        transaction: CompiledTransactionMessage & CompiledTransactionMessageWithLifetime,
        baseContext: BasePolicyContext,
    ): Promise<void> {
        // Decompile once at the start
        const decompiledMessage = decompileTransactionMessage(transaction);

        // Construct global context
        const globalCtx: GlobalPolicyContext = {
            ...baseContext,
            transaction,
            decompiledMessage,
        };

        // 1. Validate Global Policy Config
        // NOTE: Full validation delegated to external validator function
        // Users should import validateGlobalPolicy from @solana-signer/policies
        // and call it here, or use this basic stub
        const globalResult = validateGlobalConfig(config.global, globalCtx);
        assertAllowed(globalResult, "Global policy rejected transaction");

        // 2. Instruction Policies
        for (const [index, ix] of decompiledMessage.instructions.entries()) {
            const programId = ix.programAddress;
            const policy = programPolicies[programId];

            if (policy) {
                // Found specific policy for this program
                const ixCtx: InstructionPolicyContext = {
                    ...globalCtx,
                    instruction: ix,
                    instructionIndex: index,
                };
                const result = await policy.validate(ixCtx);
                assertAllowed(
                    result,
                    `Policy for program ${programId} rejected instruction ${index}`,
                );
            } else {
                // Unknown program is always denied (strict allowlist)
                throw new RemoteSignerError(
                    SignerErrorCode.POLICY_REJECTED,
                    `Instruction ${index} uses unauthorized program ${programId}`,
                );
            }
        }
    };
}

/**
 * Basic stub validator for GlobalPolicyConfig.
 * For production, use validateGlobalPolicy from @solana-signer/policies.
 */
function validateGlobalConfig(config: GlobalPolicyConfig, ctx: GlobalPolicyContext): PolicyResult {
    // Basic validation stub - only checks limits, not signer role
    if (
        config.maxInstructions &&
        ctx.decompiledMessage.instructions.length > config.maxInstructions
    ) {
        return `Too many instructions: ${ctx.decompiledMessage.instructions.length} > ${config.maxInstructions}`;
    }

    if (config.maxSignatures && ctx.transaction.header.numSignerAccounts > config.maxSignatures) {
        return `Too many signatures: ${ctx.transaction.header.numSignerAccounts} > ${config.maxSignatures}`;
    }

    // Stub: Accept all signer roles for now
    // TODO: Full implementation in @solana-signer/policies
    return true;
}

function assertAllowed(result: PolicyResult, defaultMessage: string): void {
    if (result === true) return;
    const message = typeof result === "string" ? result : defaultMessage;
    throw new RemoteSignerError(SignerErrorCode.POLICY_REJECTED, message);
}

