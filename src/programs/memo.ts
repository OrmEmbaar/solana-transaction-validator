import {
    type Instruction,
    type InstructionWithData,
    assertIsInstructionForProgram,
    assertIsInstructionWithData,
} from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import type {
    InstructionValidationContext,
    ValidationResult,
    ProgramValidator,
    ProgramPolicyConfig,
} from "../types.js";
import { runCustomValidator } from "./utils.js";

// Re-export for convenience
export { MEMO_PROGRAM_ADDRESS };

// Program-specific context type
export type MemoValidationContext = InstructionValidationContext<typeof MEMO_PROGRAM_ADDRESS>;

// Type for a validated instruction with data
type ValidatedInstruction = Instruction & InstructionWithData<Uint8Array>;

// ============================================================================
// Instruction types
// ============================================================================

/**
 * Memo program instruction types.
 * The Memo program has a single instruction type.
 */
export enum MemoInstruction {
    /** Log a UTF-8 string memo in the transaction */
    Memo = 0,
}

// ============================================================================
// Config types
// ============================================================================

/** Config for memo instructions */
export interface MemoConfig {
    /** Maximum memo length in bytes */
    maxLength?: number;
    /** Required prefix for memo content */
    requiredPrefix?: string;
}

/** Map instruction types to their config types */
export interface MemoInstructionConfigs {
    [MemoInstruction.Memo]: MemoConfig;
}

// ============================================================================
// Main config type
// ============================================================================

/**
 * Configuration for the Memo Program policy.
 *
 * Each instruction type can be:
 * - Omitted: instruction is implicitly DENIED
 * - `false`: instruction is explicitly DENIED (self-documenting)
 * - `true`: instruction is ALLOWED with no constraints
 * - Config object: instruction is ALLOWED with declarative constraints
 * - Function: instruction is ALLOWED with custom validation logic
 */
export interface MemoPolicyConfig extends ProgramPolicyConfig<
    typeof MEMO_PROGRAM_ADDRESS,
    MemoInstruction,
    MemoInstructionConfigs
> {
    /**
     * Requirements for this program in the transaction.
     * - `true`: Program MUST be present in the transaction.
     * - `undefined`: Program is optional (policy runs only if present).
     */
    required?: boolean;
}

// ============================================================================
// Policy implementation
// ============================================================================

/**
 * Creates a policy for the Memo Program.
 *
 * The Memo program logs UTF-8 strings in transaction logs and optionally
 * verifies signer accounts.
 *
 * @param config - The Memo policy configuration
 * @returns A ProgramValidator that validates Memo instructions
 *
 * @example
 * ```typescript
 * // Declarative: use built-in constraints
 * const memoPolicy = createMemoValidator({
 *     instructions: {
 *         [MemoInstruction.Memo]: {
 *             maxLength: 256,
 *             requiredPrefix: "app:",
 *         },
 *     },
 *     required: true, // This program must be present in the transaction
 * });
 *
 * // Custom: full control with a function
 * const customMemoPolicy = createMemoValidator({
 *     instructions: {
 *         [MemoInstruction.Memo]: async (ctx) => {
 *             // Custom validation logic
 *             return true;
 *         },
 *     },
 * });
 * ```
 */
export function createMemoValidator(config: MemoPolicyConfig): ProgramValidator {
    return {
        programAddress: MEMO_PROGRAM_ADDRESS,
        required: config.required,
        async validate(ctx: InstructionValidationContext): Promise<ValidationResult> {
            // Assert this is a valid Memo Program instruction with data
            assertIsInstructionForProgram(ctx.instruction, MEMO_PROGRAM_ADDRESS);
            assertIsInstructionWithData(ctx.instruction);

            // After assertions, context is now typed for Memo Program
            const typedCtx = ctx as MemoValidationContext;
            const ix = typedCtx.instruction as ValidatedInstruction;

            // Get the instruction config (Memo only has one instruction type)
            const ixConfig = config.instructions[MemoInstruction.Memo];

            // Deny: undefined or false
            if (ixConfig === undefined || ixConfig === false) {
                const reason = ixConfig === false ? "explicitly denied" : "not allowed";
                return `Memo: Memo instruction ${reason}`;
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
                // Declarative config: validate memo constraints
                const memoData = ix.data;

                // Check max length
                if (ixConfig.maxLength !== undefined && memoData.length > ixConfig.maxLength) {
                    result = `Memo: Memo length ${memoData.length} exceeds limit ${ixConfig.maxLength}`;
                } else if (ixConfig.requiredPrefix !== undefined) {
                    // Check required prefix
                    const memoText = new TextDecoder().decode(memoData);
                    if (!memoText.startsWith(ixConfig.requiredPrefix)) {
                        result = `Memo: Memo must start with "${ixConfig.requiredPrefix}"`;
                    } else {
                        result = true;
                    }
                } else {
                    result = true;
                }
            }

            if (result !== true) return result;
            return runCustomValidator(config.customValidator, typedCtx);
        },
    };
}
