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
 * Callback for instruction-level validation with a fully typed parsed instruction.
 *
 * Use this when you need full programmatic control over validation logic.
 * The instruction is already parsed and typed for the specific instruction type.
 *
 * @template TInstruction - The parsed instruction type (e.g., ParsedTransferSolInstruction)
 *
 * @example
 * ```typescript
 * // For SystemInstruction.TransferSol, callback receives ParsedTransferSolInstruction
 * const transferCallback: InstructionCallback<ParsedTransferSolInstruction> = (
 *     ctx,
 *     instruction,
 *     index
 * ) => {
 *     // TypeScript knows the exact type:
 *     // - instruction.data.amount (bigint)
 *     // - instruction.accounts.source.address
 *     // - instruction.accounts.destination.address
 *     if (instruction.data.amount > 1_000_000_000n) {
 *         return "Transfer too large";
 *     }
 *     return true;
 * };
 * ```
 */
export type InstructionCallback<TInstruction> = (
    ctx: ValidationContext,
    instruction: TInstruction,
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
    validate(
        ctx: ValidationContext,
        instruction: Instruction,
    ): Promise<ValidationResult> | ValidationResult;
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
     * - `number[]`: Program MUST be present AND contain instructions with these first-byte discriminators.
     * - `ReadonlyUint8Array[]`: Program MUST be present AND contain instructions matching these prefix discriminators.
     * - `undefined`: Program is optional (validator runs only if present).
     */
    required?: boolean | (number | ReadonlyUint8Array)[];
}

/**
 * Configuration for a single instruction.
 *
 * Uses type discrimination to determine validation mode:
 * - `undefined`: instruction is implicitly DENIED
 * - `false`: instruction is explicitly DENIED (self-documenting)
 * - `true`: instruction is ALLOWED with no validation
 * - Object (TConfig): instruction is ALLOWED with declarative constraints
 * - Function (InstructionCallback): instruction is ALLOWED with custom validation
 *
 * @template TConfig - The instruction-specific config type
 * @template TParsedInstruction - The parsed instruction type for typed callbacks
 */
export type InstructionConfigEntry<TConfig, TParsedInstruction> =
    | undefined
    | boolean
    | TConfig
    | InstructionCallback<TParsedInstruction>;
