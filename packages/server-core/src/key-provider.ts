import type { Address, ReadonlyUint8Array, Signature } from "@solana/kit";

/**
 * A provider that holds private keys and performs signing.
 *
 * This abstracts away the storage mechanism (HSM, KMS, local file, memory).
 */
export interface KeyProvider {
    /**
     * Checks if this provider manages the given address.
     */
    hasKey(address: Address): Promise<boolean>;

    /**
     * Signs an arbitrary message with the key for the given address.
     *
     * @param address - The public key to sign with
     * @param message - The raw bytes to sign
     */
    signMessage(address: Address, message: ReadonlyUint8Array): Promise<Signature>;

    /**
     * Signs a transaction message with the key for the given address.
     *
     * @param address - The public key to sign with
     * @param transactionMessage - The raw bytes of the transaction message
     */
    signTransaction(address: Address, transactionMessage: ReadonlyUint8Array): Promise<Signature>;
}
