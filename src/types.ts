import type {
    Address,
    Base64EncodedWireTransaction,
    BaseTransactionMessage,
    CompiledTransactionMessage,
    Instruction,
    TransactionMessageWithFeePayer,
    TransactionMessageWithLifetime,
} from "@solana/kit";

/**
 * Base context shared by all policy validators.
 */
export interface BasePolicyContext {
    /** The authenticated principal requesting the signature */
    principal?: string;

    /** The public key of the signer being requested */
    signer: Address;

    /** Arbitrary context from the request */
    requestContext?: Record<string, unknown>;
}

/**
 * Context for global policies (full transaction access).
 */
export interface GlobalPolicyContext extends BasePolicyContext {
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
 * Context for instruction-level policies.
 * Generic version that allows narrowing to specific program addresses.
 *
 * @template TProgramAddress - The program address type (narrows the instruction)
 */
export interface InstructionPolicyContext<
    TProgramAddress extends string = string,
> extends GlobalPolicyContext {
    /** The specific instruction being validated */
    instruction: Instruction<TProgramAddress>;

    /** The index of this instruction in the transaction */
    instructionIndex: number;
}

/**
 * Result of a policy validation.
 * - true: Allowed
 * - false: Denied (generic)
 * - string: Denied with reason
 */
export type PolicyResult = boolean | string;

/**
 * Custom validation callback with program-specific typing.
 *
 * @template TProgramAddress - The program address type for narrowing
 */
export type CustomValidationCallback<TProgramAddress extends string = string> = (
    ctx: InstructionPolicyContext<TProgramAddress>,
) => Promise<PolicyResult> | PolicyResult;

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

    /** Maximum number of instructions allowed */
    maxInstructions?: number;

    /** Maximum number of signers required */
    maxSignatures?: number;
}

/**
 * Simulation-based constraints that require RPC access.
 * These are validated separately from GlobalPolicyConfig.
 */
export interface SimulationConstraints {
    /** Maximum SOL outflow in lamports */
    maxSolOutflowLamports?: bigint;

    /** Maximum token outflow by mint address */
    maxTokenOutflowByMint?: Record<Address, bigint>;

    /** If true, account closures are forbidden */
    forbidAccountClosure?: boolean;

    /** If true, authority changes are forbidden */
    forbidAuthorityChanges?: boolean;
}

/**
 * A global policy validates the entire transaction context.
 */
export interface GlobalPolicy {
    validate(ctx: GlobalPolicyContext): Promise<PolicyResult> | PolicyResult;
}

/**
 * An instruction policy validates a single instruction.
 */
export interface InstructionPolicy {
    validate(ctx: InstructionPolicyContext): Promise<PolicyResult> | PolicyResult;
}

/**
 * A program-specific policy for instruction-level validation.
 */
export interface ProgramPolicy extends InstructionPolicy {
    /** The program ID this policy applies to */
    programAddress: Address;
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
