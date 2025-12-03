import type {
    Address,
    BaseTransactionMessage,
    CompiledTransactionMessage,
    CompiledTransactionMessageWithLifetime,
    Instruction,
    ReadonlyUint8Array,
    Transaction,
    TransactionMessageWithFeePayer,
    TransactionMessageWithLifetime,
    TransactionVersion,
} from "@solana/kit";

/**
 * Raw transaction input accepted by the validator.
 * Can be:
 * - Transaction object (most efficient - skip decoding)
 * - Base64-encoded wire transaction string
 * - Raw transaction bytes
 */
export type TransactionInput = Transaction | string | ReadonlyUint8Array;

/**
 * Context available to all validators.
 * Built internally from the raw transaction input.
 */
export interface ValidationContext {
    /** The public key of the signer being validated */
    signer: Address;

    /** The transaction object (for signing after validation) */
    transaction: Transaction;

    /** The compiled transaction message (low-level, indexed accounts) */
    compiledMessage: CompiledTransactionMessage & CompiledTransactionMessageWithLifetime;

    /** The decompiled message (high-level, with resolved addresses) */
    decompiledMessage: BaseTransactionMessage &
        TransactionMessageWithFeePayer &
        TransactionMessageWithLifetime;
}

/**
 * Context for instruction-level validation.
 * Extends ValidationContext with the specific instruction being validated.
 *
 * @template TProgramAddress - The program address type (narrows the instruction)
 */
export interface InstructionValidationContext<
    TProgramAddress extends string = string,
> extends ValidationContext {
    /** The specific instruction being validated */
    instruction: Instruction<TProgramAddress>;

    /** The index of this instruction in the transaction */
    instructionIndex: number;
}

/**
 * Result of a validation.
 * - `true`: Allowed
 * - `false`: Denied (generic rejection)
 * - `string`: Denied with a specific reason
 *
 * @example
 * ```typescript
 * // Allow the instruction
 * return true;
 *
 * // Deny with a reason
 * return "Transfer amount exceeds limit";
 *
 * // Generic deny (not recommended - prefer a reason)
 * return false;
 * ```
 */
export type ValidationResult = boolean | string;

/**
 * Custom validation callback for instruction-level validation.
 *
 * Use this when declarative constraints aren't sufficient and you need
 * full programmatic control over validation logic.
 *
 * @template TProgramAddress - The program address type for narrowing
 *
 * @example
 * ```typescript
 * const customValidator: CustomValidationCallback = async (ctx) => {
 *     const { instruction, signer } = ctx;
 *
 *     // Access parsed instruction data
 *     if (instruction.data[0] === 0x01) {
 *         return "Instruction type 0x01 is not allowed";
 *     }
 *
 *     // Check signer involvement
 *     if (instruction.accounts?.some(acc => acc.address === signer)) {
 *         return true;
 *     }
 *
 *     return "Signer must be involved in instruction";
 * };
 * ```
 */
export type CustomValidationCallback<TProgramAddress extends string = string> = (
    ctx: InstructionValidationContext<TProgramAddress>,
) => Promise<ValidationResult> | ValidationResult;

/**
 * Role the signer can play in a transaction.
 *
 * @example
 * ```typescript
 * // Signer can only pay fees, not participate in instructions
 * signerRole: SignerRole.FeePayerOnly
 *
 * // Signer can only participate, someone else pays fees
 * signerRole: SignerRole.ParticipantOnly
 *
 * // No restrictions on signer role
 * signerRole: SignerRole.Any
 * ```
 */
export enum SignerRole {
    /** Signer can ONLY pay fees (must be fee payer, cannot participate) */
    FeePayerOnly = "fee-payer-only",

    /** Signer can ONLY participate (cannot be fee payer) */
    ParticipantOnly = "participant-only",

    /** Signer can be fee payer, participant, or both (no restriction) */
    Any = "any",
}

/**
 * Global policy configuration applied to all transactions.
 *
 * @example
 * ```typescript
 * const globalPolicy: GlobalPolicyConfig = {
 *     signerRole: SignerRole.FeePayerOnly,
 *     minInstructions: 1,
 *     maxInstructions: 10,
 *     allowedVersions: [0],
 *     addressLookupTables: false,
 * };
 * ```
 */
export interface GlobalPolicyConfig {
    /** How the signer can participate in the transaction (REQUIRED) */
    signerRole: SignerRole;

    /**
     * Minimum number of instructions required.
     * @default 1 (prevents empty transactions)
     * Set to 0 to explicitly allow empty transactions.
     */
    minInstructions?: number;

    /**
     * Maximum number of instructions allowed.
     * @default undefined (no limit)
     */
    maxInstructions?: number;

    /**
     * Allowed transaction versions.
     * @default [0] (v0 transactions only - modern standard)
     * @example ['legacy'] - legacy transactions only
     * @example [0, 1] - v0 and v1, but not legacy
     */
    allowedVersions?: readonly TransactionVersion[];

    /**
     * Address lookup table policy (v0 transactions only).
     * @default false (deny all lookup tables - secure by default)
     * @example false - explicitly deny all lookup tables
     * @example true - allow any lookup tables without validation
     * @example { allowedTables: [...] } - allow specific tables with constraints
     */
    addressLookupTables?: boolean | AddressLookupConfig;
}

/**
 * Configuration for address lookup table validation.
 *
 * @example
 * ```typescript
 * // Allow specific lookup tables with constraints
 * addressLookupTables: {
 *     allowedTables: [address("4QwSwNriKPrz8DLW4ju5uxC2TN5cksJx6tPUPj7DGLAW")],
 *     maxTables: 2,
 *     maxIndexedAccounts: 32,
 * }
 * ```
 */
export interface AddressLookupConfig {
    /**
     * Allowlist of trusted lookup table addresses.
     * @default undefined (no allowlist - denies all tables)
     */
    allowedTables?: Address[];

    /**
     * Maximum number of lookup tables per transaction.
     * @default undefined (no limit)
     */
    maxTables?: number;

    /**
     * Maximum total accounts indexed across all lookups.
     * @default undefined (no limit)
     */
    maxIndexedAccounts?: number;
}

/**
 * A global validator validates the entire transaction context.
 */
export interface GlobalValidator {
    validate(ctx: ValidationContext): Promise<ValidationResult> | ValidationResult;
}

/**
 * An instruction validator validates a single instruction.
 */
export interface InstructionValidator {
    validate(ctx: InstructionValidationContext): Promise<ValidationResult> | ValidationResult;
}

/**
 * A program-specific validator for instruction-level validation.
 */
export interface ProgramValidator extends InstructionValidator {
    /** The program ID this validator applies to */
    programAddress: Address;

    /**
     * Requirements for this program in the transaction.
     * - `true`: Program MUST be present in the transaction.
     * - Array: Program MUST be present AND contain these instruction discriminators.
     * - `undefined`: Program is optional (validator runs only if present).
     */
    required?: boolean | (number | string)[];
}

/**
 * Configuration for a single instruction.
 *
 * Uses type discrimination to determine validation mode:
 * - `undefined`: instruction is implicitly DENIED
 * - `false`: instruction is explicitly DENIED (self-documenting)
 * - `true`: instruction is ALLOWED with no validation
 * - Object (TConfig): instruction is ALLOWED with declarative constraints
 * - Function (CustomValidationCallback): instruction is ALLOWED with custom validation
 *
 * @template TProgramAddress - The program address literal type
 * @template TConfig - The instruction-specific config type
 */
export type InstructionConfigEntry<TProgramAddress extends string, TConfig> =
    | undefined
    | boolean
    | TConfig
    | CustomValidationCallback<TProgramAddress>;

/**
 * Base configuration for program policies with program-specific typing.
 *
 * @template TProgramAddress - The program address literal type
 * @template TInstruction - The instruction enum type
 * @template TInstructionConfigs - Map of instruction types to their config types
 */
export interface ProgramPolicyConfig<
    TProgramAddress extends string,
    TInstruction extends number | string,
    TInstructionConfigs extends Record<TInstruction, unknown>,
> {
    /**
     * Per-instruction configuration.
     *
     * Each instruction can be configured as:
     * - Omitted/undefined: instruction is implicitly DENIED
     * - `false`: instruction is explicitly DENIED (self-documenting)
     * - `true`: instruction is ALLOWED with no constraints
     * - Config object: instruction is ALLOWED with declarative constraints
     * - Function: instruction is ALLOWED with custom validation logic
     */
    instructions: {
        [K in TInstruction]?: InstructionConfigEntry<TProgramAddress, TInstructionConfigs[K]>;
    };

    /** Program-level custom validator (runs after instruction-level validation) */
    customValidator?: CustomValidationCallback<TProgramAddress>;
}
