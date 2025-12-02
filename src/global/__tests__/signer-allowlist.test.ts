import { describe, it, expect } from "vitest";
import { validateSignerAllowlist } from "../signer-allowlist.js";
import type { GlobalPolicyContext } from "../../types.js";
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

const createContext = (signerAddr: string): GlobalPolicyContext => {
    const blockhash = {
        blockhash: "5c9TGe5te815W476jY7Z96PE5844626366663444346134646261393166" as Blockhash,
        lastValidBlockHeight: BigInt(0),
    };
    const payer = address("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T");

    const msg = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
        (tx) => setTransactionMessageFeePayer(payer, tx),
        (tx) =>
            appendTransactionMessageInstruction(
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

describe("validateSignerAllowlist", () => {
    const signer1 = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
    const signer2 = "5Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
    const signer3 = "6Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";

    it("should allow any signer when allowlist is undefined", () => {
        const ctx = createContext(signer1);
        const result = validateSignerAllowlist(undefined, ctx);
        expect(result).toBe(true);
    });

    it("should allow any signer when allowlist is empty", () => {
        const ctx = createContext(signer1);
        const result = validateSignerAllowlist([], ctx);
        expect(result).toBe(true);
    });

    it("should allow signer in allowlist", () => {
        const ctx = createContext(signer1);
        const result = validateSignerAllowlist([address(signer1), address(signer2)], ctx);
        expect(result).toBe(true);
    });

    it("should reject signer not in allowlist", () => {
        const ctx = createContext(signer3);
        const result = validateSignerAllowlist([address(signer1), address(signer2)], ctx);
        expect(result).toContain("not in the allowed signers list");
    });

    it("should work with single signer in allowlist", () => {
        const ctx = createContext(signer1);
        const result = validateSignerAllowlist([address(signer1)], ctx);
        expect(result).toBe(true);
    });
});
