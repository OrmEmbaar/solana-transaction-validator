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
import type {
    InstructionPolicy,
    InstructionPolicyContext,
    PolicyResult,
    ProgramPolicyConfig,
    CustomValidationCallback,
} from "../types.js";
import { runCustomValidator } from "./utils.js";

// Re-export for convenience
export { COMPUTE_BUDGET_PROGRAM_ADDRESS, ComputeBudgetInstruction };

// Program-specific context type
export type ComputeBudgetPolicyContext = InstructionPolicyContext<
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
 * - Omitted: instruction is implicitly DENIED
 * - `false`: instruction is explicitly DENIED (self-documenting)
 * - `true`: instruction is ALLOWED with no constraints
 * - Config object: instruction is ALLOWED with constraints
 * - Config object with customValidator: instruction validated with custom logic
 */
export type ComputeBudgetPolicyConfig = ProgramPolicyConfig<
    typeof COMPUTE_BUDGET_PROGRAM_ADDRESS,
    ComputeBudgetInstruction,
    ComputeBudgetInstructionConfigs
>;

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

            // After assertions, context is now typed for Compute Budget Program
            const typedCtx = ctx as ComputeBudgetPolicyContext;
            const ix = typedCtx.instruction as ValidatedInstruction;

            // Identify the instruction type
            const ixType = identifyComputeBudgetInstruction(ix.data);
            const ixConfig = config.instructions[ixType];

            // 1. If undefined or false, deny
            if (ixConfig === undefined || ixConfig === false) {
                const reason = ixConfig === false ? "explicitly denied" : "not allowed";
                return `Compute Budget: ${ComputeBudgetInstruction[ixType]} instruction ${reason}`;
            }

            // 2. If true, skip declarative validation
            let declarativeConfig: InstructionConfig | undefined;
            let perInstructionValidator:
                | CustomValidationCallback<typeof COMPUTE_BUDGET_PROGRAM_ADDRESS>
                | undefined;

            if (ixConfig !== true) {
                // Extract customValidator if present
                if (typeof ixConfig === "object" && "customValidator" in ixConfig) {
                    const { customValidator, ...config } = ixConfig;
                    perInstructionValidator = customValidator;
                    declarativeConfig = config as InstructionConfig;
                } else {
                    declarativeConfig = ixConfig;
                }
            }

            // 2. Handle declarative config
            if (declarativeConfig) {
                const validationResult = validateInstruction(ixType, declarativeConfig, ix);
                if (validationResult !== true) {
                    return validationResult;
                }
            }

            // 3. Call per-instruction custom validator if defined
            if (perInstructionValidator) {
                const result = await perInstructionValidator(typedCtx);
                if (result !== true) return result;
            }

            // 4. Call program-level custom validator if defined
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
