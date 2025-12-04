import {
    type Instruction,
    type InstructionWithData,
    assertIsInstructionForProgram,
    assertIsInstructionWithData,
} from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import type {
    ValidationContext,
    ValidationResult,
    ProgramValidator,
    InstructionCallback,
} from "../types.js";

// Re-export for convenience
export { MEMO_PROGRAM_ADDRESS };

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
// Parsed instruction type
// ============================================================================

/**
 * Parsed memo instruction with decoded text.
 * The memo program's instruction data is just raw UTF-8 bytes.
 */
export interface ParsedMemoInstruction {
    /** The memo text as UTF-8 string */
    text: string;
    /** The raw memo bytes */
    data: Uint8Array;
    /** The length in bytes */
    length: number;
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

// ============================================================================
// Typed instruction callback
// ============================================================================

export type MemoCallback = InstructionCallback<ParsedMemoInstruction>;

// ============================================================================
// Main config type
// ============================================================================

/** Config entry for a single instruction: boolean, declarative config, or typed callback */
type InstructionEntry<TConfig, TCallback> = undefined | boolean | TConfig | TCallback;

/**
 * Configuration for the Memo Program policy.
 *
 * Each instruction type can be:
 * - Omitted: instruction is implicitly DENIED
 * - `false`: instruction is explicitly DENIED (self-documenting)
 * - `true`: instruction is ALLOWED with no constraints
 * - Config object: instruction is ALLOWED with declarative constraints
 * - Function: instruction is ALLOWED with custom validation logic (receives typed parsed instruction)
 */
export interface MemoPolicyConfig {
    /**
     * Per-instruction configuration with typed callbacks.
     */
    instructions: {
        [MemoInstruction.Memo]?: InstructionEntry<MemoConfig, MemoCallback>;
    };

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
 * The Memo program logs UTF-8 strings in transaction logs.
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
 *     required: true,
 * });
 *
 * // Custom: full control with a typed callback
 * const customMemoPolicy = createMemoValidator({
 *     instructions: {
 *         [MemoInstruction.Memo]: async (ctx, instruction) => {
 *             // instruction is typed as ParsedMemoInstruction
 *             if (instruction.text.includes("banned")) {
 *                 return "Memo contains banned word";
 *             }
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
        async validate(
            ctx: ValidationContext,
            instruction: Instruction,
        ): Promise<ValidationResult> {
            // Assert this is a valid Memo Program instruction with data
            assertIsInstructionForProgram(instruction, MEMO_PROGRAM_ADDRESS);
            assertIsInstructionWithData(instruction);

            const ix = instruction as ValidatedInstruction;

            // Get the instruction config (Memo only has one instruction type)
            const ixConfig = config.instructions[MemoInstruction.Memo];

            // Deny: undefined or false
            if (ixConfig === undefined || ixConfig === false) {
                const reason = ixConfig === false ? "explicitly denied" : "not allowed";
                return `Memo: Memo instruction ${reason}`;
            }

            // Allow all: true
            if (ixConfig === true) {
                return true;
            }

            // Parse memo data
            const parsed = parseMemo(ix);

            // Get the validator: user-provided callback or our built-in declarative validator
            const validate =
                typeof ixConfig === "function" ? ixConfig : createMemoConfigValidator(ixConfig);

            // Validate
            return await validate(ctx, parsed);
        },
    };
}

// ============================================================================
// Parsing
// ============================================================================

function parseMemo(ix: ValidatedInstruction): ParsedMemoInstruction {
    return {
        text: new TextDecoder().decode(ix.data),
        data: ix.data,
        length: ix.data.length,
    };
}

// ============================================================================
// Declarative validator
// ============================================================================

function createMemoConfigValidator(config: MemoConfig): MemoCallback {
    return (_ctx, parsed) => {
        if (config.maxLength !== undefined && parsed.length > config.maxLength) {
            return `Memo: Memo length ${parsed.length} exceeds limit ${config.maxLength}`;
        }

        if (config.requiredPrefix !== undefined) {
            if (!parsed.text.startsWith(config.requiredPrefix)) {
                return `Memo: Memo must start with "${config.requiredPrefix}"`;
            }
        }

        return true;
    };
}
