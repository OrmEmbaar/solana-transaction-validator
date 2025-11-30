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
 */
export interface MemoPolicyConfig {
    /** Allow memo instructions. Can be true (no constraints) or a config object */
    allow:
        | MemoConfig
        | boolean
        | (MemoConfig & {
              /** Per-instruction custom validator */
              customValidator?: CustomValidationCallback<typeof MEMO_PROGRAM_ADDRESS>;
          });
    /** Optional program-level custom validator */
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
 * const memoPolicy = createMemoPolicy({
 *     allow: {
 *         maxLength: 256,
 *         requiredPrefix: "app:",
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

            // Check if memos are allowed
            if (config.allow === false) {
                return "Memo: Memo instructions not allowed";
            }

            // true = allow with no constraints
            if (config.allow === true) {
                return runCustomValidator(config.customValidator, typedCtx);
            }

            // Check if config has per-instruction custom validator
            if (typeof config.allow === "object" && "customValidator" in config.allow) {
                const { customValidator, ...memoConfig } = config.allow;

                // Validate memo content
                const memoData = ix.data;

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

                // Run per-instruction custom validator
                if (customValidator) {
                    const customResult = await customValidator(typedCtx);
                    if (customResult !== true) return customResult;
                }

                // Run program-level custom validator
                return runCustomValidator(config.customValidator, typedCtx);
            }

            // Standard config without customValidator
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
