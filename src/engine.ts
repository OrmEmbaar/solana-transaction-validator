import {
    decompileTransactionMessage,
    getBase64Encoder,
    getBase64EncodedWireTransaction,
    getCompiledTransactionMessageDecoder,
    getTransactionDecoder,
} from "@solana/kit";
import type {
    Address,
    Base64EncodedWireTransaction,
    CompiledTransactionMessage,
    CompiledTransactionMessageWithLifetime,
    Instruction,
    Rpc,
    SolanaRpcApi,
} from "@solana/kit";
import type {
    GlobalPolicyConfig,
    ValidationContext,
    InstructionValidationContext,
    ValidationResult,
    ProgramValidator,
    SimulationConstraints,
    TransactionInput,
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
 *
 * @param transaction - Raw wire transaction (base64 string or bytes)
 * @param signer - The address of the signer the transaction is being validated for
 */
export type TransactionValidator = (
    transaction: TransactionInput,
    signer: Address,
) => Promise<void>;

/**
 * Creates a transaction validator that enforces the configured policies.
 *
 * The returned validator function can be reused for multiple transactions.
 * It validates in this order:
 * 1. Global policy (signer role, limits, versions, ALTs)
 * 2. Required programs check
 * 3. Per-instruction validation against program validators
 * 4. Simulation validation (if configured)
 *
 * @param config - The validator configuration
 * @returns A validation function that throws `ValidationError` on failure
 *
 * @example
 * ```typescript
 * import { createTransactionValidator, SignerRole } from "solana-transaction-validator";
 *
 * const validator = createTransactionValidator({
 *     global: {
 *         signerRole: SignerRole.FeePayerOnly,
 *         maxInstructions: 10,
 *     },
 *     programs: [
 *         createSystemProgramValidator({
 *             instructions: {
 *                 [SystemInstruction.TransferSol]: { maxLamports: 1_000_000_000n },
 *             },
 *         }),
 *     ],
 * });
 *
 * // Use the validator
 * try {
 *     await validator(wireTransaction, signerAddress);
 *     // Safe to sign
 * } catch (error) {
 *     if (error instanceof ValidationError) {
 *         console.error("Rejected:", error.message);
 *     }
 * }
 * ```
 */
export function createTransactionValidator(
    config: TransactionValidatorConfig,
): TransactionValidator {
    const programMap = buildProgramMap(config.programs);

    return async (input, signer) => {
        const ctx = decodeAndBuildContext(input, signer);

        validateGlobal(config.global, ctx);
        validateRequiredPrograms(programMap, ctx.decompiledMessage.instructions);
        await validateInstructions(programMap, ctx);

        if (config.simulation) {
            await runSimulation(config.simulation, ctx);
        }
    };
}

/**
 * Decodes raw transaction input and builds the validation context.
 */
function decodeAndBuildContext(input: TransactionInput, signer: Address): ValidationContext {
    // Convert to bytes if base64 string
    const bytes = typeof input === "string" ? getBase64Encoder().encode(input) : input;

    // Decode to Transaction (has messageBytes + signatures)
    const decodedTx = getTransactionDecoder().decode(bytes);

    // Decode messageBytes to CompiledTransactionMessage
    const compiledMessage = getCompiledTransactionMessageDecoder().decode(
        decodedTx.messageBytes,
    ) as CompiledTransactionMessage & CompiledTransactionMessageWithLifetime;

    // Get wire transaction as base64 for simulation
    const transaction =
        typeof input === "string"
            ? (input as Base64EncodedWireTransaction)
            : getBase64EncodedWireTransaction(decodedTx);

    return {
        signer,
        transaction,
        compiledMessage,
        decompiledMessage: decompileTransactionMessage(compiledMessage),
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

function validateGlobal(config: GlobalPolicyConfig, ctx: ValidationContext): void {
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
    ctx: ValidationContext,
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

async function runSimulation(config: SimulationConfig, ctx: ValidationContext): Promise<void> {
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
