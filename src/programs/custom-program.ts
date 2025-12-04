import { type Address, type ReadonlyUint8Array, assertIsInstructionWithData } from "@solana/kit";
import type { ValidationResult, ProgramValidator } from "../types.js";
import { arraysEqual, hasPrefix } from "./utils.js";

/**
 * A rule for matching instruction discriminators.
 *
 * @example
 * ```typescript
 * // Match Anchor 8-byte discriminator (prefix)
 * { discriminator: new Uint8Array([0x9a, 0x5c, 0x1b, 0x3d, 0x8f, 0x2e, 0x7a, 0x4c]), matchMode: "prefix" }
 *
 * // Match exact instruction data
 * { discriminator: new Uint8Array([2, 0, 0, 0]), matchMode: "exact" }
 * ```
 */
export interface DiscriminatorRule {
    /** The instruction discriminator bytes to match */
    discriminator: ReadonlyUint8Array;

    /**
     * How to match the discriminator:
     * - `prefix`: Instruction data must start with these bytes
     * - `exact`: Instruction data must exactly match these bytes
     */
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
 * @returns A ProgramValidator that validates instructions against the allowlist
 *
 * @example
 * ```typescript
 * const myProgramValidator = createCustomProgramValidator({
 *     programAddress: address("MyProgram111111111111111111111111111111111"),
 *     allowedInstructions: [
 *         { discriminator: new Uint8Array([0, 1, 2, 3]), matchMode: 'prefix' },
 *         { discriminator: new Uint8Array([4, 5, 6, 7, 8, 9, 10, 11]), matchMode: 'exact' },
 *     ],
 *     required: true,
 * });
 * ```
 */
export function createCustomProgramValidator(config: CustomProgramPolicyConfig): ProgramValidator {
    return {
        programAddress: config.programAddress,
        required: config.required,
        async validate(_ctx, instruction): Promise<ValidationResult> {
            // Verify program address matches (defensive check)
            if (instruction.programAddress !== config.programAddress) {
                return `Custom Program: Program address mismatch - expected ${config.programAddress}, got ${instruction.programAddress}`;
            }

            // Assert instruction has data
            assertIsInstructionWithData(instruction);
            const ixData = instruction.data;

            // Check discriminator allowlist
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

            return true;
        },
    };
}
