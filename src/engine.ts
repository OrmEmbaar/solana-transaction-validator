import { decompileTransactionMessage } from "@solana/kit";
import type {
    Address,
    CompiledTransactionMessage,
    CompiledTransactionMessageWithLifetime,
    Instruction,
    Rpc,
    SolanaRpcApi,
} from "@solana/kit";
import type {
    BasePolicyContext,
    GlobalPolicyConfig,
    GlobalPolicyContext,
    InstructionPolicyContext,
    PolicyResult,
    ProgramPolicy,
    SimulationConstraints,
} from "./types.js";
import { PolicyValidationError } from "./errors.js";
import { validateGlobalPolicy } from "./global/validator.js";
import { validateSimulation } from "./simulation/validator.js";

/**
 * Configuration for simulation-based validation.
 * Bundles RPC client with validation constraints.
 */
export interface SimulationConfig {
    /** RPC client for running simulations */
    rpc: Rpc<SolanaRpcApi>;

    /** Simulation constraints to validate */
    constraints: SimulationConstraints;
}

export interface PolicyEngineConfig {
    /** Global constraints applied to all transactions (REQUIRED) */
    global: GlobalPolicyConfig;

    /**
     * Array of program policies to enforce.
     * Each policy is self-contained with its program address and validation logic.
     * Programs not in this list are denied by default (strict allowlist).
     */
    programs?: ProgramPolicy[];

    /**
     * Optional simulation-based validation.
     * If provided, transactions will be simulated via RPC and validated.
     */
    simulation?: SimulationConfig;
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
    // Build internal map from array for efficient lookup
    const programMap = new Map<Address, ProgramPolicy>();
    for (const policy of config.programs ?? []) {
        if (programMap.has(policy.programAddress)) {
            throw new Error(`Duplicate program policy for ${policy.programAddress}`);
        }
        programMap.set(policy.programAddress, policy);
    }

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
        validateRequiredPrograms(programMap, decompiledMessage.instructions);

        // 3. Instruction Policies
        for (const [index, ix] of decompiledMessage.instructions.entries()) {
            const programId = ix.programAddress;
            const policy = programMap.get(programId);

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
                throw new PolicyValidationError(
                    `Instruction ${index} uses unauthorized program ${programId}`,
                );
            }
        }

        // 4. Simulation Validation (optional)
        if (config.simulation) {
            const simResult = await validateSimulation(
                config.simulation.constraints,
                globalCtx,
                config.simulation.rpc,
            );
            assertAllowed(simResult, "Simulation validation failed");
        }
    };
}

/**
 * Validates that required programs and instructions are present in the transaction.
 */
function validateRequiredPrograms(
    programMap: Map<Address, ProgramPolicy>,
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

    // Check each program policy for requirements
    for (const [programId, policy] of programMap) {
        if (!policy.required) continue;

        const presentInstructions = programInstructions.get(programId);

        if (policy.required === true) {
            // Program must be present
            if (!presentInstructions) {
                throw new PolicyValidationError(
                    `Required program ${programId} is not present in transaction`,
                );
            }
        } else if (Array.isArray(policy.required)) {
            // Program must be present with specific instructions
            if (!presentInstructions) {
                throw new PolicyValidationError(
                    `Required program ${programId} is not present in transaction`,
                );
            }

            for (const requiredIx of policy.required) {
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
