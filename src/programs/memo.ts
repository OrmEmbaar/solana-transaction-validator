import {
    type Instruction,
    type InstructionWithData,
    assertIsInstructionForProgram,
    assertIsInstructionWithData,
} from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import type {
    InstructionPolicyContext,
    PolicyResult,
    ProgramPolicy,
    ProgramPolicyConfig,
} from "../types.js";
import { runCustomValidator } from "./utils.js";

// Re-export for convenience
export { MEMO_PROGRAM_ADDRESS };

// Program-specific context type
export type MemoPolicyContext = InstructionPolicyContext<typeof MEMO_PROGRAM_ADDRESS>;

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
 * @returns A ProgramPolicy that validates Memo instructions
 *
 * @example
 * ```typescript
 * // Declarative: use built-in constraints
 * const memoPolicy = createMemoPolicy({
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
 * const customMemoPolicy = createMemoPolicy({
 *     instructions: {
 *         [MemoInstruction.Memo]: async (ctx) => {
 *             // Custom validation logic
 *             return true;
 *         },
 *     },
 * });
 * ```
 */
export function createMemoPolicy(config: MemoPolicyConfig): ProgramPolicy {
    return {
        programAddress: MEMO_PROGRAM_ADDRESS,
        required: config.required,
        async validate(ctx: InstructionPolicyContext): Promise<PolicyResult> {
            // Assert this is a valid Memo Program instruction with data
            assertIsInstructionForProgram(ctx.instruction, MEMO_PROGRAM_ADDRESS);
            assertIsInstructionWithData(ctx.instruction);

            // After assertions, context is now typed for Memo Program
            const typedCtx = ctx as MemoPolicyContext;
            const ix = typedCtx.instruction as ValidatedInstruction;

            // Get the instruction config (Memo only has one instruction type)
            const ixConfig = config.instructions[MemoInstruction.Memo];

            // 1. Deny: undefined or false
            if (ixConfig === undefined || ixConfig === false) {
                const reason = ixConfig === false ? "explicitly denied" : "not allowed";
                return `Memo: Memo instruction ${reason}`;
            }

            // 2. Allow all: true
            if (ixConfig === true) {
                return runCustomValidator(config.customValidator, typedCtx);
            }

            // 3. Custom validator: function
            if (typeof ixConfig === "function") {
                const result = await ixConfig(typedCtx);
                if (result !== true) return result;
                return runCustomValidator(config.customValidator, typedCtx);
            }

            // 4. Declarative config: object
            const memoData = ix.data;
            const memoConfig = ixConfig;

            // Check max length
            if (memoConfig.maxLength !== undefined && memoData.length > memoConfig.maxLength) {
                return `Memo: Memo length ${memoData.length} exceeds limit ${memoConfig.maxLength}`;
            }

            // Check required prefix
            if (memoConfig.requiredPrefix !== undefined) {
                const memoText = new TextDecoder().decode(memoData);
                if (!memoText.startsWith(memoConfig.requiredPrefix)) {
                    return `Memo: Memo must start with "${memoConfig.requiredPrefix}"`;
                }
            }

            return runCustomValidator(config.customValidator, typedCtx);
        },
    };
}
