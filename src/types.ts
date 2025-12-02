import type {
    Address,
    Base64EncodedWireTransaction,
    BaseTransactionMessage,
    CompiledTransactionMessage,
    Instruction,
    TransactionMessageWithFeePayer,
    TransactionMessageWithLifetime,
    TransactionVersion,
} from "@solana/kit";

/**
 * Base context shared by all validators.
 */
export interface BaseValidationContext {
    /** The public key of the signer being validated */
    signer: Address;
}

/**
 * Context for global validation (full transaction access).
 */
export interface GlobalValidationContext extends BaseValidationContext {
    /** The compiled transaction message (low-level) */
    transaction: CompiledTransactionMessage;

    /** The decompiled message (high-level, inspectable) */
    decompiledMessage: BaseTransactionMessage &
        TransactionMessageWithFeePayer &
        TransactionMessageWithLifetime;

    /** The raw wire transaction bytes */
    transactionMessage?: Base64EncodedWireTransaction;
}

/**
 * Context for instruction-level validation.
 * Generic version that allows narrowing to specific program addresses.
 *
 * @template TProgramAddress - The program address type (narrows the instruction)
 */
export interface InstructionValidationContext<
    TProgramAddress extends string = string,
> extends GlobalValidationContext {
    /** The specific instruction being validated */
    instruction: Instruction<TProgramAddress>;

    /** The index of this instruction in the transaction */
    instructionIndex: number;
}

/**
 * Result of a validation.
 * - true: Allowed
 * - false: Denied (generic)
 * - string: Denied with reason
 */
export type ValidationResult = boolean | string;

/**
 * Custom validation callback with program-specific typing.
 *
 * @template TProgramAddress - The program address type for narrowing
 */
export type CustomValidationCallback<TProgramAddress extends string = string> = (
    ctx: InstructionValidationContext<TProgramAddress>,
) => Promise<ValidationResult> | ValidationResult;

/**
 * Role the signer can play in a transaction.
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
     * Minimum number of signers required.
     * @default undefined (no minimum)
     */
    minSignatures?: number;

    /**
     * Maximum number of signers allowed.
     * @default undefined (no limit)
     */
    maxSignatures?: number;

    /**
     * Maximum total accounts in transaction (static + lookup).
     * @default undefined (no limit)
     * @recommended 64 (Solana transaction limit)
     */
    maxAccounts?: number;

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
 * Simulation-based constraints that require RPC access.
 * These are validated separately from GlobalPolicyConfig.
 */
export interface SimulationConstraints {
    /**
     * Whether to forbid the signer's account from being closed.
     * @default false
     */
    forbidSignerAccountClosure?: boolean;

    /**
     * Require simulation to succeed (no errors).
     * @default true
     */
    requireSuccess?: boolean;

    /**
     * Maximum compute units consumed.
     * @default undefined (no limit)
     */
    maxComputeUnits?: number;
}

/**
 * A global validator validates the entire transaction context.
 */
export interface GlobalValidator {
    validate(ctx: GlobalValidationContext): Promise<ValidationResult> | ValidationResult;
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
