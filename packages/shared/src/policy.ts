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
 */
export interface InstructionPolicyContext extends GlobalPolicyContext {
    /** The specific instruction being validated */
    instruction: Instruction;

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

    /** Maximum SOL outflow in lamports (requires simulation or analysis) */
    maxSolOutflowLamports?: bigint;

    /** Maximum token outflow by mint address (requires simulation or analysis) */
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
