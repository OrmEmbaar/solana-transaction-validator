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
    programs: ProgramValidator[];

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
    const programMap = buildProgramMap(config.programs);

    return async (transaction, baseContext) => {
        const ctx = buildValidationContext(transaction, baseContext);

        validateGlobal(config.global, ctx);
        validateRequiredPrograms(programMap, ctx.decompiledMessage.instructions);
        await validateInstructions(programMap, ctx);

        if (config.simulation) {
            await runSimulation(config.simulation, ctx);
        }
    };
}

function buildProgramMap(programs: ProgramValidator[]): Map<Address, ProgramValidator> {
    const map = new Map<Address, ProgramValidator>();

    for (const validator of programs) {
        if (map.has(validator.programAddress)) {
            throw new Error(`Duplicate program validator for ${validator.programAddress}`);
        }
        map.set(validator.programAddress, validator);
    }

    return map;
}

function buildValidationContext(
    transaction: CompiledTransactionMessage & CompiledTransactionMessageWithLifetime,
    baseContext: BaseValidationContext,
): GlobalValidationContext {
    return {
        ...baseContext,
        transaction,
        decompiledMessage: decompileTransactionMessage(transaction),
    };
}

function validateGlobal(config: GlobalPolicyConfig, ctx: GlobalValidationContext): void {
    const result = validateGlobalPolicy(config, ctx);
    assertAllowed(result, "Global policy rejected transaction");
}

function validateRequiredPrograms(
    programMap: Map<Address, ProgramValidator>,
    instructions: readonly Instruction[],
): void {
    const presentPrograms = buildProgramPresenceMap(instructions);

    for (const [programId, validator] of programMap) {
        if (!validator.required) continue;
        assertProgramRequirementsMet(programId, validator.required, presentPrograms);
    }
}

async function validateInstructions(
    programMap: Map<Address, ProgramValidator>,
    ctx: GlobalValidationContext,
): Promise<void> {
    for (const [index, ix] of ctx.decompiledMessage.instructions.entries()) {
        const validator = programMap.get(ix.programAddress);

        if (!validator) {
            throw new ValidationError(
                `Instruction ${index} uses unauthorized program ${ix.programAddress}`,
            );
        }

        const ixCtx: InstructionValidationContext = {
            ...ctx,
            instruction: ix,
            instructionIndex: index,
        };

        const result = await validator.validate(ixCtx);
        assertAllowed(
            result,
            `Validator for program ${ix.programAddress} rejected instruction ${index}`,
        );
    }
}

async function runSimulation(
    config: SimulationConfig,
    ctx: GlobalValidationContext,
): Promise<void> {
    const result = await validateSimulation(config.constraints, ctx, config.rpc);
    assertAllowed(result, "Simulation validation failed");
}

function buildProgramPresenceMap(
    instructions: readonly Instruction[],
): Map<Address, Set<number | string>> {
    const map = new Map<Address, Set<number | string>>();

    for (const ix of instructions) {
        let discriminators = map.get(ix.programAddress);
        if (!discriminators) {
            discriminators = new Set();
            map.set(ix.programAddress, discriminators);
        }

        if (ix.data && ix.data.length > 0) {
            discriminators.add(ix.data[0]);
        }
    }

    return map;
}

function assertProgramRequirementsMet(
    programId: Address,
    required: true | (number | string)[],
    presentPrograms: Map<Address, Set<number | string>>,
): void {
    const presentInstructions = presentPrograms.get(programId);

    if (!presentInstructions) {
        throw new ValidationError(`Required program ${programId} is not present in transaction`);
    }

    if (Array.isArray(required)) {
        for (const requiredIx of required) {
            if (!presentInstructions.has(requiredIx)) {
                throw new ValidationError(
                    `Required instruction ${requiredIx} for program ${programId} is not present`,
                );
            }
        }
    }
}

function assertAllowed(result: ValidationResult, defaultMessage: string): void {
    if (result === true) return;
    throw new ValidationError(typeof result === "string" ? result : defaultMessage);
}
