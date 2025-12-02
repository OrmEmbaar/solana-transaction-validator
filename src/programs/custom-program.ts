import { type Address, type ReadonlyUint8Array, assertIsInstructionWithData } from "@solana/kit";
import type { InstructionPolicyContext, PolicyResult, ProgramPolicy } from "../types.js";
import {
    arraysEqual,
    hasPrefix,
    runCustomValidator,
    type CustomValidationCallback,
} from "./utils.js";

/**
 * A rule for matching instruction discriminators.
 */
export interface DiscriminatorRule {
    /** The instruction discriminator bytes to match */
    discriminator: ReadonlyUint8Array;

    /** How to match: 'exact' matches full data, 'prefix' matches first N bytes */
    matchMode: "exact" | "prefix";
}

/**
 * Configuration for a custom program policy.
 * Use this for programs without official @solana-program/* packages.
 */
export interface CustomProgramPolicyConfig {
    /** The program address this policy applies to */
    programAddress: Address;

    /** Array of allowed instruction discriminator rules */
    allowedInstructions: DiscriminatorRule[];

    /** Optional callback for additional validation after discriminator check */
    customValidator?: CustomValidationCallback;

    /**
     * Requirements for this program in the transaction.
     * - `true`: Program MUST be present in the transaction.
     * - `undefined`: Program is optional (policy runs only if present).
     */
    required?: boolean;
}

/**
 * Creates a policy for a custom program using discriminator allowlisting.
 *
 * This is useful for:
 * - Custom on-chain programs you've built
 * - Programs without official @solana-program/* packages
 * - Quick prototyping without needing to decode instruction data
 *
 * @param config - The custom program policy configuration
 * @returns A ProgramPolicy that validates instructions against the allowlist
 *
 * @example
 * ```typescript
 * const myProgramPolicy = createCustomProgramPolicy({
 *     programAddress: address("MyProgram111111111111111111111111111111111"),
 *     allowedInstructions: [
 *         { discriminator: new Uint8Array([0, 1, 2, 3]), matchMode: 'prefix' },
 *         { discriminator: new Uint8Array([4, 5, 6, 7, 8, 9, 10, 11]), matchMode: 'exact' },
 *     ],
 *     customValidator: async (ctx) => {
 *         // Additional validation logic
 *         return true;
 *     },
 *     required: true, // This program must be present in the transaction
 * });
 * ```
 */
export function createCustomProgramPolicy(config: CustomProgramPolicyConfig): ProgramPolicy {
    return {
        programAddress: config.programAddress,
        required: config.required,
        async validate(ctx: InstructionPolicyContext): Promise<PolicyResult> {
            // 1. Verify program address matches (defensive check)
            if (ctx.instruction.programAddress !== config.programAddress) {
                return `Custom Program: Program address mismatch - expected ${config.programAddress}, got ${ctx.instruction.programAddress}`;
            }

            // 2. Assert instruction has data
            assertIsInstructionWithData(ctx.instruction);
            const ixData = ctx.instruction.data;

            // 3. Check discriminator allowlist
            const matchedRule = config.allowedInstructions.find((rule) => {
                if (rule.matchMode === "exact") {
                    return arraysEqual(ixData, rule.discriminator);
                } else {
                    return hasPrefix(ixData, rule.discriminator);
                }
            });

            if (!matchedRule) {
                // Format discriminator for error message (first 8 bytes max)
                const discriminatorPreview = Array.from(ixData.slice(0, 8))
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("");
                const suffix = ixData.length > 8 ? "..." : "";
                return `Custom Program: Instruction discriminator 0x${discriminatorPreview}${suffix} not in allowlist for program ${config.programAddress}`;
            }

            // 4. Run custom validator if provided
            return runCustomValidator(config.customValidator, ctx);
        },
    };
}
