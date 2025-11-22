import type { Address, Base64EncodedWireTransaction, Signature } from "@solana/kit";

export interface SignerRequestMeta {
    /**
     * The authenticated identity of the caller.
     * Populated by the transport layer (e.g. after JWT validation).
     */
    principal?: string;
}

// --- Message Signing ---

export interface SignMessageRequest {
    /** The public key of the signer */
    address: Address;

    /** The arbitrary message to sign, base64 encoded */
    message: string;

    /** Optional context for policy evaluation */
    context?: Record<string, unknown>;
}

export interface SignMessageResponse {
    /** The produced signature */
    signature: Signature;

    /** The original message that was signed (echoed back) */
    signedMessage: string;
}

// --- Transaction Signing ---

export interface SignTransactionRequest {
    /** The public key of the signer */
    address: Address;

    /** The serialized transaction message */
    transactionMessage: Base64EncodedWireTransaction;

    /** Optional context for policy evaluation */
    context?: Record<string, unknown>;
}

export interface SignTransactionResponse {
    /** The produced signature */
    signature: Signature;

    /**
     * The fully signed transaction bytes.
     * This allows the caller to immediately broadcast without re-assembling.
     */
    signedTransaction: Base64EncodedWireTransaction;
}

// --- Batch Operations ---
export type SignMessagesBatchRequest = SignMessageRequest[];
export type SignMessagesBatchResponse = SignMessageResponse[];

export type SignTransactionsBatchRequest = SignTransactionRequest[];
export type SignTransactionsBatchResponse = SignTransactionResponse[];
