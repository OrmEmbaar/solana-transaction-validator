import { decompileTransactionMessage } from "@solana/kit";
import type {
    Address,
    CompiledTransactionMessage,
    CompiledTransactionMessageWithLifetime,
    Instruction,
} from "@solana/kit";
import type {
    BasePolicyContext,
    GlobalPolicyConfig,
    GlobalPolicyContext,
    InstructionPolicy,
    InstructionPolicyContext,
    PolicyResult,
} from "./types.js";
import { PolicyValidationError } from "./errors.js";
import { validateGlobalPolicy } from "./global/validator.js";

/**
 * Configuration for a specific program.
 * @template TDiscriminator - The instruction discriminator type (defaults to number | string)
 */
export interface ProgramConfig<TDiscriminator = number | string> {
    /** The policy implementation for this program */
    policy: InstructionPolicy;

    /**
     * Requirements for this program in the transaction.
     * - `true`: Program MUST be present in the transaction.
     * - `TDiscriminator[]`: Program MUST be present AND contain these instruction types.
     * - `false` / `undefined`: Program is optional (policy runs only if present).
     */
    required?: boolean | TDiscriminator[];
}

export interface PolicyEngineConfig {
    /** Global constraints applied to all transactions (REQUIRED) */
    global: GlobalPolicyConfig;

    /**
     * Map of Program ID -> Program Configuration.
     * Strictly enforces the { policy, required } object structure.
     */
    programs?: Record<Address, ProgramConfig<number | string>>;
}

/**
 * A function that validates a transaction against the configured policies.
 * Throws PolicyValidationError if validation fails.
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
    const programConfigs = config.programs ?? {};

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
        const globalResult = validateGlobalPolicy(config.global, globalCtx);
        assertAllowed(globalResult, "Global policy rejected transaction");

        // 2. Validate Required Programs and Instructions
        validateRequiredPrograms(programConfigs, decompiledMessage.instructions);

        // 3. Instruction Policies
        for (const [index, ix] of decompiledMessage.instructions.entries()) {
            const programId = ix.programAddress;
            const programConfig = programConfigs[programId];

            if (programConfig) {
                // Found specific policy for this program
                const ixCtx: InstructionPolicyContext = {
                    ...globalCtx,
                    instruction: ix,
                    instructionIndex: index,
                };
                const result = await programConfig.policy.validate(ixCtx);
                assertAllowed(
                    result,
                    `Policy for program ${programId} rejected instruction ${index}`,
                );
            } else {
                // Unknown program is always denied (strict allowlist)
                throw new PolicyValidationError(
                    `Instruction ${index} uses unauthorized program ${programId}`,
                );
            }
        }
    };
}

/**
 * Validates that required programs and instructions are present in the transaction.
 */
function validateRequiredPrograms(
    programConfigs: Record<Address, ProgramConfig<number | string>>,
    instructions: readonly Instruction[],
): void {
    // Build a map of program -> instruction discriminators present
    const programInstructions = new Map<Address, Set<number | string>>();

    for (const ix of instructions) {
        if (!programInstructions.has(ix.programAddress)) {
            programInstructions.set(ix.programAddress, new Set());
        }
        // Extract discriminator (first byte of instruction data)
        if (ix.data && ix.data.length > 0) {
            programInstructions.get(ix.programAddress)!.add(ix.data[0]);
        }
    }

    // Check each program config for requirements
    for (const [programId, config] of Object.entries(programConfigs)) {
        if (!config.required) continue;

        const presentInstructions = programInstructions.get(programId as Address);

        if (config.required === true) {
            // Program must be present
            if (!presentInstructions) {
                throw new PolicyValidationError(
                    `Required program ${programId} is not present in transaction`,
                );
            }
        } else if (Array.isArray(config.required)) {
            // Program must be present with specific instructions
            if (!presentInstructions) {
                throw new PolicyValidationError(
                    `Required program ${programId} is not present in transaction`,
                );
            }

            for (const requiredIx of config.required) {
                if (!presentInstructions.has(requiredIx)) {
                    throw new PolicyValidationError(
                        `Required instruction ${requiredIx} for program ${programId} is not present`,
                    );
                }
            }
        }
    }
}

function assertAllowed(result: PolicyResult, defaultMessage: string): void {
    if (result === true) return;
    const message = typeof result === "string" ? result : defaultMessage;
    throw new PolicyValidationError(message);
}
