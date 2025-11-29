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
} from "@solana-program/compute-budget";
import type { InstructionPolicy, InstructionPolicyContext, PolicyResult } from "../types.js";
import { runCustomValidator, type CustomValidationCallback } from "./utils.js";

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

/** Empty config for instructions with no additional constraints */
export type NoConstraintsConfig = Record<string, never>;

/** Map instruction types to their config types */
export interface ComputeBudgetInstructionConfigs {
    [ComputeBudgetInstruction.RequestUnits]: NoConstraintsConfig; // Deprecated but may appear
    [ComputeBudgetInstruction.SetComputeUnitLimit]: SetComputeUnitLimitConfig;
    [ComputeBudgetInstruction.SetComputeUnitPrice]: SetComputeUnitPriceConfig;
    [ComputeBudgetInstruction.RequestHeapFrame]: RequestHeapFrameConfig;
    [ComputeBudgetInstruction.SetLoadedAccountsDataSizeLimit]: NoConstraintsConfig;
}

// ============================================================================
// Main config type
// ============================================================================

/**
 * Configuration for the Compute Budget Program policy.
 *
 * Each instruction type can be:
 * - Omitted: instruction is DENIED
 * - `true`: instruction is ALLOWED with no constraints
 * - Config object: instruction is ALLOWED with constraints
 */
export interface ComputeBudgetPolicyConfig {
    /** Per-instruction configuration */
    instructions: {
        [K in ComputeBudgetInstruction]?: ComputeBudgetInstructionConfigs[K] | boolean;
    };
    /** Optional custom validator for additional logic */
    customValidator?: CustomValidationCallback;
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
 * @returns An InstructionPolicy that validates Compute Budget instructions
 *
 * @example
 * ```typescript
 * const computeBudgetPolicy = createComputeBudgetPolicy({
 *     instructions: {
 *         [ComputeBudgetInstruction.SetComputeUnitLimit]: {
 *             maxUnits: 1_400_000,
 *         },
 *         [ComputeBudgetInstruction.SetComputeUnitPrice]: {
 *             maxMicroLamportsPerCu: 1_000_000n,
 *         },
 *     },
 * });
 * ```
 */
export function createComputeBudgetPolicy(config: ComputeBudgetPolicyConfig): InstructionPolicy {
    return {
        async validate(ctx: InstructionPolicyContext): Promise<PolicyResult> {
            // Assert this is a valid Compute Budget Program instruction with data
            assertIsInstructionForProgram(ctx.instruction, COMPUTE_BUDGET_PROGRAM_ADDRESS);
            assertIsInstructionWithData(ctx.instruction);

            // After assertions, instruction is now ValidatedInstruction
            const ix = ctx.instruction as ValidatedInstruction;

            // Identify the instruction type
            const ixType = identifyComputeBudgetInstruction(ix.data);
            const ixConfig = config.instructions[ixType];

            // Omitted = denied
            if (ixConfig === undefined) {
                return `Compute Budget: ${ComputeBudgetInstruction[ixType]} instruction not allowed`;
            }

            // true = allow with no constraints
            if (ixConfig === true) {
                return runCustomValidator(config.customValidator, ctx);
            }

            // false should not happen (undefined is the deny case), but handle it
            if (ixConfig === false) {
                return `Compute Budget: ${ComputeBudgetInstruction[ixType]} instruction not allowed`;
            }

            // Validate based on instruction type
            const validationResult = validateInstruction(ixType, ixConfig, ix);
            if (validationResult !== true) {
                return validationResult;
            }

            return runCustomValidator(config.customValidator, ctx);
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
    | NoConstraintsConfig;

function validateInstruction(
    ixType: ComputeBudgetInstruction,
    ixConfig: InstructionConfig,
    ix: ValidatedInstruction,
): PolicyResult {
    switch (ixType) {
        case ComputeBudgetInstruction.SetComputeUnitLimit:
            return validateSetComputeUnitLimit(ixConfig as SetComputeUnitLimitConfig, ix);

        case ComputeBudgetInstruction.SetComputeUnitPrice:
            return validateSetComputeUnitPrice(ixConfig as SetComputeUnitPriceConfig, ix);

        case ComputeBudgetInstruction.RequestHeapFrame:
            return validateRequestHeapFrame(ixConfig as RequestHeapFrameConfig, ix);

        case ComputeBudgetInstruction.SetLoadedAccountsDataSizeLimit:
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
): PolicyResult {
    const parsed = parseSetComputeUnitLimitInstruction(ix);

    if (config.maxUnits !== undefined && parsed.data.units > config.maxUnits) {
        return `Compute Budget: SetComputeUnitLimit units ${parsed.data.units} exceeds limit ${config.maxUnits}`;
    }

    return true;
}

function validateSetComputeUnitPrice(
    config: SetComputeUnitPriceConfig,
    ix: ValidatedInstruction,
): PolicyResult {
    const parsed = parseSetComputeUnitPriceInstruction(ix);

    if (
        config.maxMicroLamportsPerCu !== undefined &&
        parsed.data.microLamports > config.maxMicroLamportsPerCu
    ) {
        return `Compute Budget: SetComputeUnitPrice microLamports ${parsed.data.microLamports} exceeds limit ${config.maxMicroLamportsPerCu}`;
    }

    return true;
}

function validateRequestHeapFrame(config: RequestHeapFrameConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseRequestHeapFrameInstruction(ix);

    if (config.maxBytes !== undefined && parsed.data.bytes > config.maxBytes) {
        return `Compute Budget: RequestHeapFrame bytes ${parsed.data.bytes} exceeds limit ${config.maxBytes}`;
    }

    return true;
}
