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
    InstructionValidationContext,
    ValidationResult,
    ProgramValidator,
    ProgramPolicyConfig,
} from "../types.js";
import { runCustomValidator } from "./utils.js";

// Re-export for convenience
export { COMPUTE_BUDGET_PROGRAM_ADDRESS, ComputeBudgetInstruction };

// Program-specific context type
export type ComputeBudgetValidationContext = InstructionValidationContext<
    typeof COMPUTE_BUDGET_PROGRAM_ADDRESS
>;

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

/** Map instruction types to their config types */
export interface ComputeBudgetInstructionConfigs {
    [ComputeBudgetInstruction.RequestUnits]: NoConstraintsConfig; // Deprecated but may appear
    [ComputeBudgetInstruction.SetComputeUnitLimit]: SetComputeUnitLimitConfig;
    [ComputeBudgetInstruction.SetComputeUnitPrice]: SetComputeUnitPriceConfig;
    [ComputeBudgetInstruction.RequestHeapFrame]: RequestHeapFrameConfig;
    [ComputeBudgetInstruction.SetLoadedAccountsDataSizeLimit]: SetLoadedAccountsDataSizeLimitConfig;
}

// ============================================================================
// Main config type
// ============================================================================

/**
 * Configuration for the Compute Budget Program policy.
 *
 * Each instruction type can be:
 * - Omitted: instruction is implicitly DENIED
 * - `false`: instruction is explicitly DENIED (self-documenting)
 * - `true`: instruction is ALLOWED with no constraints
 * - Config object: instruction is ALLOWED with declarative constraints
 * - Function: instruction is ALLOWED with custom validation logic
 */
export interface ComputeBudgetPolicyConfig extends ProgramPolicyConfig<
    typeof COMPUTE_BUDGET_PROGRAM_ADDRESS,
    ComputeBudgetInstruction,
    ComputeBudgetInstructionConfigs
> {
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
 * Uses the official @solana-program/compute-budget package for instruction
 * identification and parsing.
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
 *         // Custom: full control with a function
 *         [ComputeBudgetInstruction.SetComputeUnitPrice]: async (ctx) => {
 *             // Custom validation logic
 *             return true;
 *         },
 *     },
 *     required: true, // This program must be present in the transaction
 * });
 * ```
 */
export function createComputeBudgetValidator(config: ComputeBudgetPolicyConfig): ProgramValidator {
    return {
        programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS,
        required: config.required,
        async validate(ctx: InstructionValidationContext): Promise<ValidationResult> {
            // Assert this is a valid Compute Budget Program instruction with data
            assertIsInstructionForProgram(ctx.instruction, COMPUTE_BUDGET_PROGRAM_ADDRESS);
            assertIsInstructionWithData(ctx.instruction);

            // After assertions, context is now typed for Compute Budget Program
            const typedCtx = ctx as ComputeBudgetValidationContext;
            const ix = typedCtx.instruction as ValidatedInstruction;

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
                return runCustomValidator(config.customValidator, typedCtx);
            }

            // Validate: function or declarative config
            let result: ValidationResult;
            if (typeof ixConfig === "function") {
                result = await ixConfig(typedCtx);
            } else {
                result = validateInstruction(ixType, ixConfig, ix);
            }

            if (result !== true) return result;
            return runCustomValidator(config.customValidator, typedCtx);
        },
    };
}

// ============================================================================
// Instruction-specific validation
// ============================================================================

type InstructionConfig =
    | SetComputeUnitLimitConfig
    | SetComputeUnitPriceConfig
    | RequestHeapFrameConfig
    | SetLoadedAccountsDataSizeLimitConfig
    | NoConstraintsConfig;

function validateInstruction(
    ixType: ComputeBudgetInstruction,
    ixConfig: InstructionConfig,
    ix: ValidatedInstruction,
): ValidationResult {
    switch (ixType) {
        case ComputeBudgetInstruction.SetComputeUnitLimit:
            return validateSetComputeUnitLimit(ixConfig as SetComputeUnitLimitConfig, ix);

        case ComputeBudgetInstruction.SetComputeUnitPrice:
            return validateSetComputeUnitPrice(ixConfig as SetComputeUnitPriceConfig, ix);

        case ComputeBudgetInstruction.RequestHeapFrame:
            return validateRequestHeapFrame(ixConfig as RequestHeapFrameConfig, ix);

        case ComputeBudgetInstruction.SetLoadedAccountsDataSizeLimit:
            return validateSetLoadedAccountsDataSizeLimit(
                ixConfig as SetLoadedAccountsDataSizeLimitConfig,
                ix,
            );

        case ComputeBudgetInstruction.RequestUnits:
            // No additional validation for these instructions
            return true;

        default:
            return `Compute Budget: Unknown instruction type ${ixType}`;
    }
}

function validateSetComputeUnitLimit(
    config: SetComputeUnitLimitConfig,
    ix: ValidatedInstruction,
): ValidationResult {
    const parsed = parseSetComputeUnitLimitInstruction(ix);

    if (config.maxUnits !== undefined && parsed.data.units > config.maxUnits) {
        return `Compute Budget: SetComputeUnitLimit units ${parsed.data.units} exceeds limit ${config.maxUnits}`;
    }

    return true;
}

function validateSetComputeUnitPrice(
    config: SetComputeUnitPriceConfig,
    ix: ValidatedInstruction,
): ValidationResult {
    const parsed = parseSetComputeUnitPriceInstruction(ix);

    if (
        config.maxMicroLamportsPerCu !== undefined &&
        parsed.data.microLamports > config.maxMicroLamportsPerCu
    ) {
        return `Compute Budget: SetComputeUnitPrice microLamports ${parsed.data.microLamports} exceeds limit ${config.maxMicroLamportsPerCu}`;
    }

    return true;
}

function validateRequestHeapFrame(
    config: RequestHeapFrameConfig,
    ix: ValidatedInstruction,
): ValidationResult {
    const parsed = parseRequestHeapFrameInstruction(ix);

    if (config.maxBytes !== undefined && parsed.data.bytes > config.maxBytes) {
        return `Compute Budget: RequestHeapFrame bytes ${parsed.data.bytes} exceeds limit ${config.maxBytes}`;
    }

    return true;
}

function validateSetLoadedAccountsDataSizeLimit(
    config: SetLoadedAccountsDataSizeLimitConfig,
    ix: ValidatedInstruction,
): ValidationResult {
    const parsed = parseSetLoadedAccountsDataSizeLimitInstruction(ix);

    if (config.maxBytes !== undefined && parsed.data.accountDataSizeLimit > config.maxBytes) {
        return `Compute Budget: SetLoadedAccountsDataSizeLimit bytes ${parsed.data.accountDataSizeLimit} exceeds limit ${config.maxBytes}`;
    }

    return true;
}
