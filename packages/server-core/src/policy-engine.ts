import { decompileTransactionMessage } from "@solana/kit";
import type {
    Address,
    CompiledTransactionMessage,
    CompiledTransactionMessageWithLifetime,
} from "@solana/kit";
import type { Policy, PolicyContext, PolicyResult } from "@solana-signer/shared";
import { RemoteSignerError, SignerErrorCode } from "@solana-signer/shared";

export interface PolicyEngineConfig {
    /** Policies that apply to the entire transaction context */
    global?: Policy[];
    /** Map of Program ID -> Policy for instruction-level validation */
    programs?: Record<Address, Policy>;
}

/**
 * A function that validates a transaction against the configured policies.
 * Throws RemoteSignerError if validation fails.
 */
export type TransactionValidator = (
    transaction: CompiledTransactionMessage & CompiledTransactionMessageWithLifetime,
    baseContext: Omit<PolicyContext, "transaction" | "instruction">,
) => Promise<void>;

/**
 * Creates a validation function that enforces the configured policies.
 *
 * @param config - The policy configuration
 * @returns A validation function that can be reused for multiple requests
 */
export function createPolicyValidator(config: PolicyEngineConfig): TransactionValidator {
    const globalPolicies = config.global ?? [];
    const programPolicies = config.programs ?? {};

    return async function validateTransaction(
        transaction: CompiledTransactionMessage & CompiledTransactionMessageWithLifetime,
        baseContext: Omit<PolicyContext, "transaction" | "instruction">,
    ): Promise<void> {
        const ctx: PolicyContext = { ...baseContext, transaction };

        // 1. Global Policies
        for (const policy of globalPolicies) {
            const result = await policy.validate(ctx);
            assertAllowed(result, "Global policy rejected transaction");
        }

        // Decompile to get high-level instructions with resolved addresses
        const decompiledMessage = decompileTransactionMessage(transaction);

        // 2. Instruction Policies
        for (const [index, ix] of decompiledMessage.instructions.entries()) {
            const programId = ix.programAddress;
            const policy = programPolicies[programId];

            if (policy) {
                // Found specific policy for this program
                const ixCtx: PolicyContext = { ...ctx, instruction: ix };
                const result = await policy.validate(ixCtx);
                assertAllowed(
                    result,
                    `Policy for program ${programId} rejected instruction ${index}`,
                );
            } else {
                // Unknown program is always denied
                throw new RemoteSignerError(
                    SignerErrorCode.POLICY_REJECTED,
                    `Instruction ${index} uses unauthorized program ${programId}`,
                );
            }
        }
    };
}

function assertAllowed(result: PolicyResult, defaultMessage: string): void {
    if (result === true) return;
    const message = typeof result === "string" ? result : defaultMessage;
    throw new RemoteSignerError(SignerErrorCode.POLICY_REJECTED, message);
}
