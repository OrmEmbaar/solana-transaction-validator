/**
 * Shared test utilities for integration tests.
 * Keep this minimal - only truly shared constants and utilities.
 */

import { expect } from "vitest";
import {
    address,
    generateKeyPairSigner,
    compileTransaction,
    getBase64EncodedWireTransaction,
    type Address,
    type Base64EncodedWireTransaction,
    type TransactionMessage,
    type TransactionMessageWithFeePayer,
    type TransactionMessageWithLifetime,
} from "@solana/kit";
import { createTransactionValidator } from "../../src/engine.js";
import { ValidationError } from "../../src/errors.js";

/**
 * Helper to convert a transaction message to wire format for testing.
 * This is needed because the validator now accepts wire transactions (base64 or bytes)
 * instead of compiled messages.
 */
export function toWireTransaction(
    txMessage: TransactionMessage & TransactionMessageWithFeePayer & TransactionMessageWithLifetime,
): Base64EncodedWireTransaction {
    const transaction = compileTransaction(txMessage);
    return getBase64EncodedWireTransaction(transaction);
}

// Test Addresses - generated during setup
export let SIGNER_ADDRESS: Address;
export let ATTACKER_ADDRESS: Address;
export let VICTIM_ADDRESS: Address;
export let ALLOWED_DESTINATION: Address;
export let TREASURY_ADDRESS: Address;
export let FAKE_TOKEN_PROGRAM: Address;
export const STAKE_PROGRAM_ADDRESS = address("Stake11111111111111111111111111111111111111");

export async function initializeTestAddresses() {
    SIGNER_ADDRESS = (await generateKeyPairSigner()).address;
    ATTACKER_ADDRESS = (await generateKeyPairSigner()).address;
    VICTIM_ADDRESS = (await generateKeyPairSigner()).address;
    ALLOWED_DESTINATION = (await generateKeyPairSigner()).address;
    TREASURY_ADDRESS = (await generateKeyPairSigner()).address;
    FAKE_TOKEN_PROGRAM = (await generateKeyPairSigner()).address;
}

export async function expectValidationError(
    validator: ReturnType<typeof createTransactionValidator>,
    transaction: Base64EncodedWireTransaction,
    signerAddress: Address,
    expectedMessagePart: string,
) {
    await expect(validator(transaction, signerAddress)).rejects.toThrow(ValidationError);

    try {
        await validator(transaction, signerAddress);
    } catch (error) {
        if (error instanceof ValidationError) {
            expect(error.message).toContain(expectedMessagePart);
        }
    }
}
