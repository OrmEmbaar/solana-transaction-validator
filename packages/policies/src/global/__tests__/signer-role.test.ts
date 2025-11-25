import { describe, it, expect } from "vitest";
import { validateSignerRole } from "../signer-role.js";
import { SignerRole, type GlobalPolicyContext } from "@solana-signer/shared";
import {
    address,
    compileTransactionMessage,
    pipe,
    createTransactionMessage,
    setTransactionMessageLifetimeUsingBlockhash,
    setTransactionMessageFeePayer,
    decompileTransactionMessage,
    appendTransactionMessageInstruction,
    type Blockhash,
} from "@solana/kit";

const createContext = (
    signerAddr: string,
    feePayerAddr: string,
    signerAsAccount = false,
): GlobalPolicyContext => {
    const blockhash = {
        blockhash: "5c9TGe5te815W476jY7Z96PE5844626366663444346134646261393166" as Blockhash,
        lastValidBlockHeight: BigInt(0),
    };

    const msg = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
        (tx) => setTransactionMessageFeePayer(address(feePayerAddr), tx),
        (tx) =>
            signerAsAccount
                ? appendTransactionMessageInstruction(
                      {
                          programAddress: address("11111111111111111111111111111111"),
                          accounts: [
                              {
                                  address: address(signerAddr),
                                  role: 0, // Writable signer
                              },
                          ],
                          data: new Uint8Array([]),
                      },
                      tx,
                  )
                : appendTransactionMessageInstruction(
                      {
                          programAddress: address("11111111111111111111111111111111"),
                          accounts: [],
                          data: new Uint8Array([]),
                      },
                      tx,
                  ),
    );

    const compiled = compileTransactionMessage(msg);
    const decompiledMessage = decompileTransactionMessage(compiled);

    return {
        signer: address(signerAddr),
        transaction: compiled,
        decompiledMessage,
    };
};

describe("validateSignerRole", () => {
    const SIGNER_ADDR = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
    const OTHER_ADDR = "5Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";

    describe("SignerRole.Any", () => {
        it("should allow signer as fee payer", () => {
            const ctx = createContext(SIGNER_ADDR, SIGNER_ADDR, false);
            const result = validateSignerRole(SignerRole.Any, ctx);
            expect(result).toBe(true);
        });

        it("should allow signer as non-fee payer", () => {
            const ctx = createContext(SIGNER_ADDR, OTHER_ADDR, false);
            const result = validateSignerRole(SignerRole.Any, ctx);
            expect(result).toBe(true);
        });

        it("should allow signer as participant", () => {
            const ctx = createContext(SIGNER_ADDR, OTHER_ADDR, true);
            const result = validateSignerRole(SignerRole.Any, ctx);
            expect(result).toBe(true);
        });

        it("should allow signer as both fee payer and participant", () => {
            const ctx = createContext(SIGNER_ADDR, SIGNER_ADDR, true);
            const result = validateSignerRole(SignerRole.Any, ctx);
            expect(result).toBe(true);
        });
    });

    describe("SignerRole.FeePayerOnly", () => {
        it("should allow signer as fee payer with no participation", () => {
            const ctx = createContext(SIGNER_ADDR, SIGNER_ADDR, false);
            const result = validateSignerRole(SignerRole.FeePayerOnly, ctx);
            expect(result).toBe(true);
        });

        it("should reject signer when not fee payer", () => {
            const ctx = createContext(SIGNER_ADDR, OTHER_ADDR, false);
            const result = validateSignerRole(SignerRole.FeePayerOnly, ctx);
            expect(result).toBe("Signer must be the fee payer");
        });

        it("should reject signer when fee payer but also participant", () => {
            const ctx = createContext(SIGNER_ADDR, SIGNER_ADDR, true);
            const result = validateSignerRole(SignerRole.FeePayerOnly, ctx);
            expect(result).toBe("Signer can only be fee payer, not a participant");
        });
    });

    describe("SignerRole.ParticipantOnly", () => {
        it("should allow signer as participant (not fee payer)", () => {
            const ctx = createContext(SIGNER_ADDR, OTHER_ADDR, true);
            const result = validateSignerRole(SignerRole.ParticipantOnly, ctx);
            expect(result).toBe(true);
        });

        it("should reject signer when neither fee payer nor participant", () => {
            // Edge case: signer doesn't appear anywhere - should be rejected
            const ctx = createContext(SIGNER_ADDR, OTHER_ADDR, false);
            const result = validateSignerRole(SignerRole.ParticipantOnly, ctx);
            expect(result).toBe("Signer must be a participant");
        });

        it("should reject signer as fee payer (even if not participant)", () => {
            const ctx = createContext(SIGNER_ADDR, SIGNER_ADDR, false);
            const result = validateSignerRole(SignerRole.ParticipantOnly, ctx);
            expect(result).toBe("Signer cannot be the fee payer");
        });

        it("should reject signer as both fee payer and participant", () => {
            const ctx = createContext(SIGNER_ADDR, SIGNER_ADDR, true);
            const result = validateSignerRole(SignerRole.ParticipantOnly, ctx);
            expect(result).toBe("Signer cannot be the fee payer");
        });
    });
});

