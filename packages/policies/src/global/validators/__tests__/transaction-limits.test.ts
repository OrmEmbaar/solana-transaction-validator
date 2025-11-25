import { describe, it, expect } from "vitest";
import { validateTransactionLimits } from "../transaction-limits.js";
import type { GlobalPolicyContext } from "@solana-signer/shared";
import {
    address,
    compileTransactionMessage,
    pipe,
    createTransactionMessage,
    setTransactionMessageLifetimeUsingBlockhash,
    setTransactionMessageFeePayer,
    decompileTransactionMessage,
    appendTransactionMessageInstructions,
    type Blockhash,
} from "@solana/kit";

const createContext = (numInstructions: number, numSigners = 1): GlobalPolicyContext => {
    const blockhash = {
        blockhash: "5c9TGe5te815W476jY7Z96PE5844626366663444346134646261393166" as Blockhash,
        lastValidBlockHeight: BigInt(0),
    };
    const payer = address("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T");

    const instructions = Array.from({ length: numInstructions }, () => ({
        programAddress: address("11111111111111111111111111111111"),
        accounts: [] as const,
        data: new Uint8Array([]),
    }));

    const msg = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
        (tx) => setTransactionMessageFeePayer(payer, tx),
        (tx) => appendTransactionMessageInstructions(instructions, tx),
    );

    const compiled = compileTransactionMessage(msg);
    const decompiledMessage = decompileTransactionMessage(compiled);

    return {
        signer: payer,
        transaction: compiled,
        decompiledMessage,
    };
};

describe("validateTransactionLimits", () => {
    describe("maxInstructions", () => {
        it("should allow transactions within limit", () => {
            const ctx = createContext(3);
            const result = validateTransactionLimits({ maxInstructions: 5 }, ctx);
            expect(result).toBe(true);
        });

        it("should allow transactions at exact limit", () => {
            const ctx = createContext(5);
            const result = validateTransactionLimits({ maxInstructions: 5 }, ctx);
            expect(result).toBe(true);
        });

        it("should reject transactions exceeding limit", () => {
            const ctx = createContext(10);
            const result = validateTransactionLimits({ maxInstructions: 5 }, ctx);
            expect(result).toBe("Too many instructions: 10 > 5");
        });

        it("should allow unlimited instructions when not configured", () => {
            const ctx = createContext(100);
            const result = validateTransactionLimits({}, ctx);
            expect(result).toBe(true);
        });
    });

    describe("maxSignatures", () => {
        it("should allow transactions within signature limit", () => {
            const ctx = createContext(1);
            const result = validateTransactionLimits({ maxSignatures: 5 }, ctx);
            expect(result).toBe(true);
        });

        it("should allow unlimited signatures when not configured", () => {
            const ctx = createContext(1);
            const result = validateTransactionLimits({}, ctx);
            expect(result).toBe(true);
        });
    });

    describe("combined limits", () => {
        it("should enforce all configured limits", () => {
            const ctx = createContext(3);
            const result = validateTransactionLimits(
                {
                    maxInstructions: 10,
                    maxSignatures: 5,
                },
                ctx,
            );
            expect(result).toBe(true);
        });

        it("should fail on first violated limit", () => {
            const ctx = createContext(10);
            const result = validateTransactionLimits(
                {
                    maxInstructions: 5, // This fails
                    maxSignatures: 1, // Would also fail but not reached
                },
                ctx,
            );
            expect(result).toBe("Too many instructions: 10 > 5");
        });
    });
});
