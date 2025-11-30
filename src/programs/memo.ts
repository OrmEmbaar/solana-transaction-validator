import {
    type Instruction,
    type InstructionWithData,
    assertIsInstructionForProgram,
    assertIsInstructionWithData,
} from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import type {
    InstructionPolicy,
    InstructionPolicyContext,
    PolicyResult,
    CustomValidationCallback,
    InstructionConfigEntry,
} from "../types.js";
import { runCustomValidator } from "./utils.js";

// Re-export for convenience
export { MEMO_PROGRAM_ADDRESS };

// Program-specific context type
export type MemoPolicyContext = InstructionPolicyContext<typeof MEMO_PROGRAM_ADDRESS>;

// Type for a validated instruction with data
type ValidatedInstruction = Instruction & InstructionWithData<Uint8Array>;

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

/**
 * Configuration for the Memo Program policy.
 *
 * The Memo program has a single instruction type (memo), so the config
 * is simpler than other program policies.
 *
 * The `allow` field can be:
 * - `false`: memos are DENIED
 * - `true`: memos are ALLOWED with no constraints
 * - Config object: memos are ALLOWED with declarative constraints
 * - Function: memos are ALLOWED with custom validation logic
 */
export interface MemoPolicyConfig {
    /** Allow memo instructions */
    allow: InstructionConfigEntry<typeof MEMO_PROGRAM_ADDRESS, MemoConfig>;
    /** Program-level custom validator (runs after instruction-level validation) */
    customValidator?: CustomValidationCallback<typeof MEMO_PROGRAM_ADDRESS>;
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
 * @returns An InstructionPolicy that validates Memo instructions
 *
 * @example
 * ```typescript
 * // Declarative: use built-in constraints
 * const memoPolicy = createMemoPolicy({
 *     allow: {
 *         maxLength: 256,
 *         requiredPrefix: "app:",
 *     },
 * });
 *
 * // Custom: full control with a function
 * const customMemoPolicy = createMemoPolicy({
 *     allow: async (ctx) => {
 *         // Custom validation logic
 *         return true;
 *     },
 * });
 * ```
 */
export function createMemoPolicy(config: MemoPolicyConfig): InstructionPolicy {
    return {
        async validate(ctx: InstructionPolicyContext): Promise<PolicyResult> {
            // Assert this is a valid Memo Program instruction with data
            assertIsInstructionForProgram(ctx.instruction, MEMO_PROGRAM_ADDRESS);
            assertIsInstructionWithData(ctx.instruction);

            // After assertions, context is now typed for Memo Program
            const typedCtx = ctx as MemoPolicyContext;
            const ix = typedCtx.instruction as ValidatedInstruction;

            // 1. Deny: undefined or false
            if (config.allow === undefined || config.allow === false) {
                return "Memo: Memo instructions not allowed";
            }

            // 2. Allow all: true
            if (config.allow === true) {
                return runCustomValidator(config.customValidator, typedCtx);
            }

            // 3. Custom validator: function
            if (typeof config.allow === "function") {
                const result = await config.allow(typedCtx);
                if (result !== true) return result;
                return runCustomValidator(config.customValidator, typedCtx);
            }

            // 4. Declarative config: object
            const memoData = ix.data;
            const memoConfig = config.allow;

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
