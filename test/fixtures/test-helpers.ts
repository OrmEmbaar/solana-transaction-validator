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
    type Blockhash,
    type Rpc,
    type SolanaRpcApi,
    type Base64EncodedWireTransaction,
    type CompiledTransactionMessage,
    type CompiledTransactionMessageWithLifetime,
    type TransactionMessage,
    type TransactionMessageWithFeePayer,
    type TransactionMessageWithLifetime,
} from "@solana/kit";
import { createTransactionValidator } from "../../src/engine.js";
import { ValidationError } from "../../src/errors.js";

// Type for transactions (base64 wire format or compiled message for backward compatibility)
export type TestTransaction =
    | Base64EncodedWireTransaction
    | (CompiledTransactionMessage & CompiledTransactionMessageWithLifetime);

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

// Test Configuration
export const RPC_ENDPOINT = "http://localhost:8899";

// Test Addresses - generated during setup
export let SIGNER_ADDRESS: Address;
export let ATTACKER_ADDRESS: Address;
export let VICTIM_ADDRESS: Address;
export let ALLOWED_DESTINATION: Address;
export let TREASURY_ADDRESS: Address;
export let FAKE_TOKEN_PROGRAM: Address;
export const STAKE_PROGRAM_ADDRESS = address("Stake11111111111111111111111111111111111111");

// Global Test State
export let rpc: Rpc<SolanaRpcApi>;
export let validatorAvailable = false;
export let latestBlockhash: { blockhash: Blockhash; lastValidBlockHeight: bigint };

export function setRpc(rpcInstance: Rpc<SolanaRpcApi> & { requestAirdrop?: unknown }) {
    rpc = rpcInstance as Rpc<SolanaRpcApi>;
}

export function setValidatorAvailable(available: boolean) {
    validatorAvailable = available;
}

export function setLatestBlockhash(blockhash: {
    blockhash: Blockhash;
    lastValidBlockHeight: bigint;
}) {
    latestBlockhash = blockhash;
}

export async function initializeTestAddresses() {
    SIGNER_ADDRESS = (await generateKeyPairSigner()).address;
    ATTACKER_ADDRESS = (await generateKeyPairSigner()).address;
    VICTIM_ADDRESS = (await generateKeyPairSigner()).address;
    ALLOWED_DESTINATION = (await generateKeyPairSigner()).address;
    TREASURY_ADDRESS = (await generateKeyPairSigner()).address;
    FAKE_TOKEN_PROGRAM = (await generateKeyPairSigner()).address;
}

// Helper Functions

export async function checkValidatorAvailability(rpcClient: Rpc<SolanaRpcApi>): Promise<boolean> {
    try {
        const response = await rpcClient.getHealth().send();
        return response === "ok";
    } catch {
        return false;
    }
}

export async function getRecentBlockhash(rpcClient?: Rpc<SolanaRpcApi>) {
    if (!latestBlockhash || !validatorAvailable || !rpcClient) {
        return {
            blockhash: "11111111111111111111111111111111111111111111" as Blockhash,
            lastValidBlockHeight: 0n,
        };
    }
    const response = await rpcClient.getLatestBlockhash().send();
    return {
        blockhash: response.value.blockhash,
        lastValidBlockHeight: response.value.lastValidBlockHeight,
    };
}

export async function expectValidationError(
    validator: ReturnType<typeof createTransactionValidator>,
    transaction: TestTransaction,
    signerAddress: Address,
    expectedMessagePart: string,
) {
    type ValidatorInput = Parameters<typeof validator>[0];
    await expect(validator(transaction as ValidatorInput, signerAddress)).rejects.toThrow(
        ValidationError,
    );

    try {
        await validator(transaction as ValidatorInput, signerAddress);
    } catch (error) {
        if (error instanceof ValidationError) {
            expect(error.message).toContain(expectedMessagePart);
        }
    }
}
