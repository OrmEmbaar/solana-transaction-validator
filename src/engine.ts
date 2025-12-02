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
    BaseValidationContext,
    GlobalPolicyConfig,
    GlobalValidationContext,
    InstructionValidationContext,
    ValidationResult,
    ProgramValidator,
    SimulationConstraints,
} from "./types.js";
import { ValidationError } from "./errors.js";
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

/**
 * Configuration for creating a transaction validator.
 */
export interface TransactionValidatorConfig {
    /** Global policy configuration applied to all transactions (REQUIRED) */
    global: GlobalPolicyConfig;

    /**
     * Array of program validators to enforce.
     * Each validator is self-contained with its program address and validation logic.
     * Programs not in this list are denied by default (strict allowlist).
     */
    programs?: ProgramValidator[];

    /**
     * Optional simulation-based validation.
     * If provided, transactions will be simulated via RPC and validated.
     */
    simulation?: SimulationConfig;
}

/**
 * A function that validates a transaction against the configured policies.
 * Throws ValidationError if validation fails.
 */
export type TransactionValidator = (
    transaction: CompiledTransactionMessage & CompiledTransactionMessageWithLifetime,
    baseContext: BaseValidationContext,
) => Promise<void>;

/**
 * Creates a transaction validator that enforces the configured policies.
 *
 * @param config - The validator configuration
 * @returns A validation function that can be reused for multiple requests
 */
export function createTransactionValidator(
    config: TransactionValidatorConfig,
): TransactionValidator {
    // Build internal map from array for efficient lookup
    const programMap = new Map<Address, ProgramValidator>();
    for (const validator of config.programs ?? []) {
        if (programMap.has(validator.programAddress)) {
            throw new Error(`Duplicate program validator for ${validator.programAddress}`);
        }
        programMap.set(validator.programAddress, validator);
    }

    return async function validateTransaction(
        transaction: CompiledTransactionMessage & CompiledTransactionMessageWithLifetime,
        baseContext: BaseValidationContext,
    ): Promise<void> {
        // Decompile once at the start
        const decompiledMessage = decompileTransactionMessage(transaction);

        // Construct global context
        const globalCtx: GlobalValidationContext = {
            ...baseContext,
            transaction,
            decompiledMessage,
        };

        // 1. Validate Global Policy Config
        const globalResult = validateGlobalPolicy(config.global, globalCtx);
        assertAllowed(globalResult, "Global policy rejected transaction");

        // 2. Validate Required Programs and Instructions
        validateRequiredPrograms(programMap, decompiledMessage.instructions);

        // 3. Instruction Validation
        for (const [index, ix] of decompiledMessage.instructions.entries()) {
            const programId = ix.programAddress;
            const validator = programMap.get(programId);

            if (validator) {
                // Found specific validator for this program
                const ixCtx: InstructionValidationContext = {
                    ...globalCtx,
                    instruction: ix,
                    instructionIndex: index,
                };
                const result = await validator.validate(ixCtx);
                assertAllowed(
                    result,
                    `Validator for program ${programId} rejected instruction ${index}`,
                );
            } else {
                // Unknown program is always denied (strict allowlist)
                throw new ValidationError(
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
    programMap: Map<Address, ProgramValidator>,
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

    // Check each program validator for requirements
    for (const [programId, validator] of programMap) {
        if (!validator.required) continue;

        const presentInstructions = programInstructions.get(programId);

        if (validator.required === true) {
            // Program must be present
            if (!presentInstructions) {
                throw new ValidationError(
                    `Required program ${programId} is not present in transaction`,
                );
            }
        } else if (Array.isArray(validator.required)) {
            // Program must be present with specific instructions
            if (!presentInstructions) {
                throw new ValidationError(
                    `Required program ${programId} is not present in transaction`,
                );
            }

            for (const requiredIx of validator.required) {
                if (!presentInstructions.has(requiredIx)) {
                    throw new ValidationError(
                        `Required instruction ${requiredIx} for program ${programId} is not present`,
                    );
                }
            }
        }
    }
}

function assertAllowed(result: ValidationResult, defaultMessage: string): void {
    if (result === true) return;
    const message = typeof result === "string" ? result : defaultMessage;
    throw new ValidationError(message);
}
