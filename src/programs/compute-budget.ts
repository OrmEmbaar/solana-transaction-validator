import {
    type Instruction,
    type InstructionWithData,
    assertIsInstructionForProgram,
    assertIsInstructionWithData,
} from "@solana/kit";
import {
    COMPUTE_BUDGET_PROGRAM_ADDRESS,
    ComputeBudgetInstruction,
    identifyComputeBudgetInstruction,
    parseSetComputeUnitLimitInstruction,
    parseSetComputeUnitPriceInstruction,
    parseRequestHeapFrameInstruction,
    parseSetLoadedAccountsDataSizeLimitInstruction,
} from "@solana-program/compute-budget";
import type {
    ParsedSetComputeUnitLimitInstruction,
    ParsedSetComputeUnitPriceInstruction,
    ParsedRequestHeapFrameInstruction,
    ParsedSetLoadedAccountsDataSizeLimitInstruction,
} from "@solana-program/compute-budget";
import type {
    ValidationContext,
    ValidationResult,
    ProgramValidator,
    InstructionCallback,
} from "../types.js";

// Re-export for convenience
export { COMPUTE_BUDGET_PROGRAM_ADDRESS, ComputeBudgetInstruction };

// Type for a validated instruction with data
type ValidatedInstruction = Instruction & InstructionWithData<Uint8Array>;

// ============================================================================
// Per-instruction config types
// ============================================================================

/** Config for SetComputeUnitLimit instruction */
export interface SetComputeUnitLimitConfig {
    /** Maximum compute units allowed */
    maxUnits?: number;
}

/** Config for SetComputeUnitPrice instruction */
export interface SetComputeUnitPriceConfig {
    /** Maximum micro-lamports per compute unit */
    maxMicroLamportsPerCu?: bigint;
}

/** Config for RequestHeapFrame instruction */
export interface RequestHeapFrameConfig {
    /** Maximum heap frame bytes allowed */
    maxBytes?: number;
}

/** Config for SetLoadedAccountsDataSizeLimit instruction */
export interface SetLoadedAccountsDataSizeLimitConfig {
    /** Maximum number of bytes that can be requested */
    maxBytes?: number;
}

/** Empty config for instructions with no additional constraints */
export type NoConstraintsConfig = Record<string, never>;

// ============================================================================
// Typed instruction callbacks
// ============================================================================

export type SetComputeUnitLimitCallback = InstructionCallback<ParsedSetComputeUnitLimitInstruction>;
export type SetComputeUnitPriceCallback = InstructionCallback<ParsedSetComputeUnitPriceInstruction>;
export type RequestHeapFrameCallback = InstructionCallback<ParsedRequestHeapFrameInstruction>;
export type SetLoadedAccountsDataSizeLimitCallback =
    InstructionCallback<ParsedSetLoadedAccountsDataSizeLimitInstruction>;

// ============================================================================
// Main config type
// ============================================================================

/** Config entry for a single instruction: boolean, declarative config, or typed callback */
type InstructionEntry<TConfig, TCallback> = undefined | boolean | TConfig | TCallback;

/**
 * Configuration for the Compute Budget Program policy.
 *
 * Each instruction type can be:
 * - Omitted: instruction is implicitly DENIED
 * - `false`: instruction is explicitly DENIED (self-documenting)
 * - `true`: instruction is ALLOWED with no constraints
 * - Config object: instruction is ALLOWED with declarative constraints
 * - Function: instruction is ALLOWED with custom validation logic (receives typed parsed instruction)
 */
export interface ComputeBudgetPolicyConfig {
    /**
     * Per-instruction configuration with typed callbacks.
     */
    instructions: {
        [ComputeBudgetInstruction.SetComputeUnitLimit]?: InstructionEntry<
            SetComputeUnitLimitConfig,
            SetComputeUnitLimitCallback
        >;
        [ComputeBudgetInstruction.SetComputeUnitPrice]?: InstructionEntry<
            SetComputeUnitPriceConfig,
            SetComputeUnitPriceCallback
        >;
        [ComputeBudgetInstruction.RequestHeapFrame]?: InstructionEntry<
            RequestHeapFrameConfig,
            RequestHeapFrameCallback
        >;
        [ComputeBudgetInstruction.SetLoadedAccountsDataSizeLimit]?: InstructionEntry<
            SetLoadedAccountsDataSizeLimitConfig,
            SetLoadedAccountsDataSizeLimitCallback
        >;
        // RequestUnits is deprecated but may still appear
        [ComputeBudgetInstruction.RequestUnits]?: boolean;
    };

    /**
     * Requirements for this program in the transaction.
     * - `true`: Program MUST be present in the transaction.
     * - `ComputeBudgetInstruction[]`: Program MUST be present AND contain these instruction types.
     * - `undefined`: Program is optional (policy runs only if present).
     */
    required?: boolean | ComputeBudgetInstruction[];
}

// ============================================================================
// Policy implementation
// ============================================================================

/**
 * Creates a policy for the Compute Budget Program.
 *
 * @param config - The Compute Budget policy configuration
 * @returns A ProgramValidator that validates Compute Budget instructions
 *
 * @example
 * ```typescript
 * const computeBudgetPolicy = createComputeBudgetValidator({
 *     instructions: {
 *         // Declarative: use built-in constraints
 *         [ComputeBudgetInstruction.SetComputeUnitLimit]: {
 *             maxUnits: 1_400_000,
 *         },
 *         // Custom: full control with a typed callback
 *         [ComputeBudgetInstruction.SetComputeUnitPrice]: async (ctx, instruction) => {
 *             // instruction is fully typed as ParsedSetComputeUnitPriceInstruction
 *             return true;
 *         },
 *     },
 *     required: true,
 * });
 * ```
 */
export function createComputeBudgetValidator(config: ComputeBudgetPolicyConfig): ProgramValidator {
    return {
        programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS,
        required: config.required,
        async validate(
            ctx: ValidationContext,
            instruction: Instruction,
        ): Promise<ValidationResult> {
            // Assert this is a valid Compute Budget Program instruction with data
            assertIsInstructionForProgram(instruction, COMPUTE_BUDGET_PROGRAM_ADDRESS);
            assertIsInstructionWithData(instruction);

            const ix = instruction as ValidatedInstruction;

            // Identify the instruction type
            const ixType = identifyComputeBudgetInstruction(ix.data);
            const ixConfig = config.instructions[ixType];

            // Deny: undefined or false
            if (ixConfig === undefined || ixConfig === false) {
                const reason = ixConfig === false ? "explicitly denied" : "not allowed";
                return `Compute Budget: ${ComputeBudgetInstruction[ixType]} instruction ${reason}`;
            }

            // Allow all: true
            if (ixConfig === true) {
                return true;
            }

            // Look up the handler for this instruction type
            const handler = instructionHandlers[ixType];
            if (!handler) {
                // No handler means this instruction just passes through (like RequestUnits)
                return true;
            }

            // Get the validator: user-provided callback or our built-in declarative validator
            const validate =
                typeof ixConfig === "function" ? ixConfig : handler.createValidator(ixConfig);

            // Parse and validate
            return await validate(ctx, handler.parse(ix));
        },
    };
}

// ============================================================================
// Instruction handler registry
// ============================================================================

/**
 * Handler for a single instruction type.
 * Pairs the parser with the declarative validator factory.
 */
interface InstructionHandler {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse: (ix: ValidatedInstruction) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createValidator: (config: any) => InstructionCallback<any>;
}

/**
 * Registry of all instruction handlers.
 * Each entry pairs the parser function with the declarative validator factory.
 */
const instructionHandlers: Partial<Record<ComputeBudgetInstruction, InstructionHandler>> = {
    [ComputeBudgetInstruction.SetComputeUnitLimit]: {
        parse: parseSetComputeUnitLimitInstruction,
        createValidator: createSetComputeUnitLimitValidator,
    },
    [ComputeBudgetInstruction.SetComputeUnitPrice]: {
        parse: parseSetComputeUnitPriceInstruction,
        createValidator: createSetComputeUnitPriceValidator,
    },
    [ComputeBudgetInstruction.RequestHeapFrame]: {
        parse: parseRequestHeapFrameInstruction,
        createValidator: createRequestHeapFrameValidator,
    },
    [ComputeBudgetInstruction.SetLoadedAccountsDataSizeLimit]: {
        parse: parseSetLoadedAccountsDataSizeLimitInstruction,
        createValidator: createSetLoadedAccountsDataSizeLimitValidator,
    },
};

// ============================================================================
// Declarative validators
// ============================================================================

function createSetComputeUnitLimitValidator(
    config: SetComputeUnitLimitConfig,
): SetComputeUnitLimitCallback {
    return (_ctx, parsed) => {
        if (config.maxUnits !== undefined && parsed.data.units > config.maxUnits) {
            return `Compute Budget: SetComputeUnitLimit units ${parsed.data.units} exceeds limit ${config.maxUnits}`;
        }
        return true;
    };
}

function createSetComputeUnitPriceValidator(
    config: SetComputeUnitPriceConfig,
): SetComputeUnitPriceCallback {
    return (_ctx, parsed) => {
        if (
            config.maxMicroLamportsPerCu !== undefined &&
            parsed.data.microLamports > config.maxMicroLamportsPerCu
        ) {
            return `Compute Budget: SetComputeUnitPrice microLamports ${parsed.data.microLamports} exceeds limit ${config.maxMicroLamportsPerCu}`;
        }
        return true;
    };
}

function createRequestHeapFrameValidator(config: RequestHeapFrameConfig): RequestHeapFrameCallback {
    return (_ctx, parsed) => {
        if (config.maxBytes !== undefined && parsed.data.bytes > config.maxBytes) {
            return `Compute Budget: RequestHeapFrame bytes ${parsed.data.bytes} exceeds limit ${config.maxBytes}`;
        }
        return true;
    };
}

function createSetLoadedAccountsDataSizeLimitValidator(
    config: SetLoadedAccountsDataSizeLimitConfig,
): SetLoadedAccountsDataSizeLimitCallback {
    return (_ctx, parsed) => {
        if (config.maxBytes !== undefined && parsed.data.accountDataSizeLimit > config.maxBytes) {
            return `Compute Budget: SetLoadedAccountsDataSizeLimit bytes ${parsed.data.accountDataSizeLimit} exceeds limit ${config.maxBytes}`;
        }
        return true;
    };
}
