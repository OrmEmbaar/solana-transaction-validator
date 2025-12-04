import {
    type Address,
    type Instruction,
    type ReadonlyUint8Array,
    assertIsInstructionWithData,
} from "@solana/kit";
import type { ValidationContext, ValidationResult, ProgramValidator } from "../types.js";
import { hasPrefix } from "./utils.js";

/**
 * A rule for matching instruction discriminators.
 * The discriminator length determines how many bytes are matched (prefix match).
 *
 * @example
 * ```typescript
 * // Match Anchor 8-byte discriminator
 * { discriminator: new Uint8Array([0x9a, 0x5c, 0x1b, 0x3d, 0x8f, 0x2e, 0x7a, 0x4c]) }
 *
 * // Match 1-byte native discriminator
 * { discriminator: new Uint8Array([2]) }
 *
 * // With custom validation callback
 * {
 *     discriminator: new Uint8Array([0x9a, 0x5c, 0x1b, 0x3d, 0x8f, 0x2e, 0x7a, 0x4c]),
 *     validate: (ctx, ix) => { ... }
 * }
 * ```
 */
export interface DiscriminatorRule {
    /** Discriminator bytes - instruction data must start with these */
    discriminator: ReadonlyUint8Array;

    /**
     * Optional validation callback for additional logic.
     * Called after discriminator match succeeds.
     * If not provided, the instruction is allowed after discriminator match.
     */
    validate?: (
        ctx: ValidationContext,
        instruction: Instruction,
    ) => ValidationResult | Promise<ValidationResult>;
}

/**
 * Configuration for a custom program policy.
 * Use this for programs without official @solana-program/* packages.
 */
export interface CustomProgramPolicyConfig {
    /** The program address this policy applies to */
    programAddress: Address;

    /**
     * Array of allowed instruction discriminator rules.
     * Instructions not matching any discriminator are denied.
     */
    instructions: DiscriminatorRule[];

    /**
     * Requirements for this program in the transaction.
     * - `true`: Program MUST be present in the transaction.
     * - `ReadonlyUint8Array[]`: Program MUST be present AND contain instructions matching these discriminators.
     * - `undefined`: Program is optional (policy runs only if present).
     */
    required?: boolean | ReadonlyUint8Array[];
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
 * @returns A ProgramValidator that validates instructions against the allowlist
 *
 * @example
 * ```typescript
 * const myProgramValidator = createCustomProgramValidator({
 *     programAddress: address("MyProgram111111111111111111111111111111111"),
 *     instructions: [
 *         { discriminator: new Uint8Array([0x9a, 0x5c, 0x1b, 0x3d, 0x8f, 0x2e, 0x7a, 0x4c]) },
 *         { discriminator: new Uint8Array([1]) },
 *         {
 *             discriminator: new Uint8Array([2]),
 *             validate: (ctx, ix) => {
 *                 // Custom validation logic
 *                 return true;
 *             },
 *         },
 *     ],
 *     required: true,
 * });
 * ```
 */
export function createCustomProgramValidator(config: CustomProgramPolicyConfig): ProgramValidator {
    return {
        programAddress: config.programAddress,
        required: config.required,
        async validate(ctx, instruction): Promise<ValidationResult> {
            // Verify program address matches (defensive check)
            if (instruction.programAddress !== config.programAddress) {
                return `Custom Program: Program address mismatch - expected ${config.programAddress}, got ${instruction.programAddress}`;
            }

            // Assert instruction has data
            assertIsInstructionWithData(instruction);
            const ixData = instruction.data;

            // Find matching rule (prefix match based on discriminator length)
            const matchedRule = config.instructions.find((rule) =>
                hasPrefix(ixData, rule.discriminator),
            );

            if (!matchedRule) {
                // Format discriminator for error message (first 8 bytes max)
                const discriminatorPreview = Array.from(ixData.slice(0, 8))
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("");
                const suffix = ixData.length > 8 ? "..." : "";
                return `Custom Program: Discriminator 0x${discriminatorPreview}${suffix} not in allowlist`;
            }

            // Call callback if provided, otherwise allow
            if (matchedRule.validate) {
                return matchedRule.validate(ctx, instruction);
            }

            return true;
        },
    };
}
