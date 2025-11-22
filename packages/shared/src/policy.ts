import type { Address, Base64EncodedWireTransaction, Instruction, Transaction } from "@solana/kit";

/**
 * The context passed to a policy validator.
 */
export interface PolicyContext {
    /** The authenticated principal requesting the signature */
    principal?: string;

    /** The public key of the signer being requested */
    signer: Address;

    /** The fully parsed transaction (if applicable) */
    transaction?: Transaction;

    /**
     * The raw transaction message bytes (if applicable).
     * Useful for policies that need to verify the exact bytes being signed.
     */
    transactionMessage?: Base64EncodedWireTransaction;

    /**
     * The instruction being validated (if iterating instructions).
     */
    instruction?: Instruction;

    /** Arbitrary context passed from the request */
    requestContext?: Record<string, unknown>;
}

/**
 * Result of a policy validation.
 * - true: Allowed
 * - false: Denied (generic)
 * - string: Denied with reason
 */
export type PolicyResult = boolean | string;

/**
 * A policy that validates a signing request.
 */
export interface Policy {
    /**
     * Validates the request context.
     * Returns `true` if allowed, `false` or a reason string if denied.
     */
    validate(ctx: PolicyContext): Promise<PolicyResult> | PolicyResult;
}

/**
 * A specialized policy for a specific program.
 */
export interface ProgramPolicy extends Policy {
    /** The program ID this policy applies to */
    programAddress: Address;
}

