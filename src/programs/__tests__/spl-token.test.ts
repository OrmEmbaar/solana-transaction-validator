import { describe, it, expect } from "vitest";
import { createSplTokenValidator, TokenInstruction } from "../spl-token.js";
import type { InstructionValidationContext } from "../../types.js";
import { address, type Instruction } from "@solana/kit";
import {
    getTransferInstruction,
    getTransferCheckedInstruction,
    getApproveInstruction,
    getApproveCheckedInstruction,
    getMintToInstruction,
    getMintToCheckedInstruction,
    getBurnInstruction,
    getBurnCheckedInstruction,
    getSetAuthorityInstruction,
    getRevokeInstruction,
    getCloseAccountInstruction,
    getFreezeAccountInstruction,
    getThawAccountInstruction,
} from "@solana-program/token";

// Valid base58 addresses
const SIGNER = address("11111111111111111111111111111112");
const TOKEN_ACCOUNT = address("11111111111111111111111111111113");
const DESTINATION = address("11111111111111111111111111111114");
const ANOTHER_DESTINATION = address("11111111111111111111111111111119");
const MINT = address("11111111111111111111111111111115");
const ANOTHER_MINT = address("11111111111111111111111111111116");
const DELEGATE = address("11111111111111111111111111111117");
const ANOTHER_DELEGATE = address("11111111111111111111111111111118");
const ANOTHER_OWNER = address("1111111111111111111111111111111A");

// Helper to create a mock instruction context
const createMockContext = (instruction: Instruction): InstructionValidationContext => {
    return {
        signer: SIGNER,
        transaction: {} as InstructionValidationContext["transaction"],
        decompiledMessage: {} as InstructionValidationContext["decompiledMessage"],
        instruction: instruction as InstructionValidationContext["instruction"],
        instructionIndex: 0,
    };
};

describe("createSplTokenValidator", () => {
    describe("instruction allowlist", () => {
        it("should deny instruction when not in config", async () => {
            const policy = createSplTokenValidator({
                instructions: {},
            });

            const ix = getTransferInstruction({
                source: TOKEN_ACCOUNT,
                destination: DESTINATION,
                amount: 1000n,
                authority: SIGNER,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("Transfer instruction not allowed");
        });

        it("should explicitly deny instruction when set to false", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.Transfer]: false,
                },
            });

            const ix = getTransferInstruction({
                source: TOKEN_ACCOUNT,
                destination: DESTINATION,
                authority: SIGNER,
                amount: 1000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("explicitly denied");
        });

        it("should allow instruction when set to true", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.Transfer]: true,
                },
            });

            const ix = getTransferInstruction({
                source: TOKEN_ACCOUNT,
                destination: DESTINATION,
                authority: SIGNER,
                amount: 1000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should allow instruction with custom validator function", async () => {
            let validatorCalled = false;
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.Transfer]: async () => {
                        validatorCalled = true;
                        return true;
                    },
                },
            });

            const ix = getTransferInstruction({
                source: TOKEN_ACCOUNT,
                destination: DESTINATION,
                authority: SIGNER,
                amount: 1000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
            expect(validatorCalled).toBe(true);
        });
    });

    describe("Transfer validation", () => {
        it("should allow transfer within limit", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.Transfer]: {
                        maxAmount: 1_000_000n,
                    },
                },
            });

            const ix = getTransferInstruction({
                source: TOKEN_ACCOUNT,
                destination: DESTINATION,
                authority: SIGNER,
                amount: 500_000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject transfer exceeding limit", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.Transfer]: {
                        maxAmount: 1_000_000n,
                    },
                },
            });

            const ix = getTransferInstruction({
                source: TOKEN_ACCOUNT,
                destination: DESTINATION,
                authority: SIGNER,
                amount: 2_000_000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("exceeds limit");
        });
    });

    describe("TransferChecked validation", () => {
        it("should allow transfer with valid mint", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.TransferChecked]: {
                        allowedMints: [MINT],
                    },
                },
            });

            const ix = getTransferCheckedInstruction({
                source: TOKEN_ACCOUNT,
                mint: MINT,
                destination: DESTINATION,
                authority: SIGNER,
                amount: 1000n,
                decimals: 6,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject transfer with non-allowed mint", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.TransferChecked]: {
                        allowedMints: [MINT],
                    },
                },
            });

            const ix = getTransferCheckedInstruction({
                source: TOKEN_ACCOUNT,
                mint: ANOTHER_MINT,
                destination: DESTINATION,
                authority: SIGNER,
                amount: 1000n,
                decimals: 6,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("not in allowlist");
        });

        it("should enforce both amount and mint constraints", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.TransferChecked]: {
                        maxAmount: 1_000_000n,
                        allowedMints: [MINT],
                    },
                },
            });

            // Valid
            const ix1 = getTransferCheckedInstruction({
                source: TOKEN_ACCOUNT,
                mint: MINT,
                destination: DESTINATION,
                authority: SIGNER,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix1))).toBe(true);

            // Invalid amount
            const ix2 = getTransferCheckedInstruction({
                source: TOKEN_ACCOUNT,
                mint: MINT,
                destination: DESTINATION,
                authority: SIGNER,
                amount: 2_000_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix2))).toContain("exceeds limit");

            // Invalid mint
            const ix3 = getTransferCheckedInstruction({
                source: TOKEN_ACCOUNT,
                mint: ANOTHER_MINT,
                destination: DESTINATION,
                authority: SIGNER,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix3))).toContain("not in allowlist");
        });
    });

    describe("Approve validation", () => {
        it("should allow approve within limit", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.Approve]: {
                        maxAmount: 1_000_000n,
                    },
                },
            });

            const ix = getApproveInstruction({
                source: TOKEN_ACCOUNT,
                delegate: DELEGATE,
                owner: SIGNER,
                amount: 500_000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject approve exceeding limit", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.Approve]: {
                        maxAmount: 1_000_000n,
                    },
                },
            });

            const ix = getApproveInstruction({
                source: TOKEN_ACCOUNT,
                delegate: DELEGATE,
                owner: SIGNER,
                amount: 2_000_000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("exceeds limit");
        });

        it("should allow approve to allowed delegate", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.Approve]: {
                        allowedDelegates: [DELEGATE],
                    },
                },
            });

            const ix = getApproveInstruction({
                source: TOKEN_ACCOUNT,
                delegate: DELEGATE,
                owner: SIGNER,
                amount: 1000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject approve to non-allowed delegate", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.Approve]: {
                        allowedDelegates: [DELEGATE],
                    },
                },
            });

            const ix = getApproveInstruction({
                source: TOKEN_ACCOUNT,
                delegate: ANOTHER_DELEGATE,
                owner: SIGNER,
                amount: 1000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("not in allowlist");
        });
    });

    describe("ApproveChecked validation", () => {
        it("should enforce all constraints", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.ApproveChecked]: {
                        maxAmount: 1_000_000n,
                        allowedMints: [MINT],
                        allowedDelegates: [DELEGATE],
                    },
                },
            });

            // Valid
            const ix1 = getApproveCheckedInstruction({
                source: TOKEN_ACCOUNT,
                mint: MINT,
                delegate: DELEGATE,
                owner: SIGNER,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix1))).toBe(true);

            // Invalid amount
            const ix2 = getApproveCheckedInstruction({
                source: TOKEN_ACCOUNT,
                mint: MINT,
                delegate: DELEGATE,
                owner: SIGNER,
                amount: 2_000_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix2))).toContain("exceeds limit");

            // Invalid mint
            const ix3 = getApproveCheckedInstruction({
                source: TOKEN_ACCOUNT,
                mint: ANOTHER_MINT,
                delegate: DELEGATE,
                owner: SIGNER,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix3))).toContain("not in allowlist");

            // Invalid delegate
            const ix4 = getApproveCheckedInstruction({
                source: TOKEN_ACCOUNT,
                mint: MINT,
                delegate: ANOTHER_DELEGATE,
                owner: SIGNER,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix4))).toContain("not in allowlist");
        });
    });

    describe("MintTo validation", () => {
        it("should allow mint within limit", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.MintTo]: {
                        maxAmount: 1_000_000n,
                    },
                },
            });

            const ix = getMintToInstruction({
                mint: MINT,
                token: TOKEN_ACCOUNT,
                mintAuthority: SIGNER,
                amount: 500_000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject mint exceeding limit", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.MintTo]: {
                        maxAmount: 1_000_000n,
                    },
                },
            });

            const ix = getMintToInstruction({
                mint: MINT,
                token: TOKEN_ACCOUNT,
                mintAuthority: SIGNER,
                amount: 2_000_000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("exceeds limit");
        });

        it("should allow mint to allowed mint", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.MintTo]: {
                        allowedMints: [MINT],
                    },
                },
            });

            const ix = getMintToInstruction({
                mint: MINT,
                token: TOKEN_ACCOUNT,
                mintAuthority: SIGNER,
                amount: 1000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject mint to non-allowed mint", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.MintTo]: {
                        allowedMints: [MINT],
                    },
                },
            });

            const ix = getMintToInstruction({
                mint: ANOTHER_MINT,
                token: TOKEN_ACCOUNT,
                mintAuthority: SIGNER,
                amount: 1000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("not in allowlist");
        });
    });

    describe("MintToChecked validation", () => {
        it("should enforce amount and mint constraints", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.MintToChecked]: {
                        maxAmount: 1_000_000n,
                        allowedMints: [MINT],
                    },
                },
            });

            // Valid
            const ix1 = getMintToCheckedInstruction({
                mint: MINT,
                token: TOKEN_ACCOUNT,
                mintAuthority: SIGNER,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix1))).toBe(true);

            // Invalid amount
            const ix2 = getMintToCheckedInstruction({
                mint: MINT,
                token: TOKEN_ACCOUNT,
                mintAuthority: SIGNER,
                amount: 2_000_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix2))).toContain("exceeds limit");

            // Invalid mint
            const ix3 = getMintToCheckedInstruction({
                mint: ANOTHER_MINT,
                token: TOKEN_ACCOUNT,
                mintAuthority: SIGNER,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix3))).toContain("not in allowlist");
        });
    });

    describe("Burn validation", () => {
        it("should allow burn within limit", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.Burn]: {
                        maxAmount: 1_000_000n,
                    },
                },
            });

            const ix = getBurnInstruction({
                account: TOKEN_ACCOUNT,
                mint: MINT,
                authority: SIGNER,
                amount: 500_000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject burn exceeding limit", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.Burn]: {
                        maxAmount: 1_000_000n,
                    },
                },
            });

            const ix = getBurnInstruction({
                account: TOKEN_ACCOUNT,
                mint: MINT,
                authority: SIGNER,
                amount: 2_000_000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("exceeds limit");
        });
    });

    describe("BurnChecked validation", () => {
        it("should enforce amount and mint constraints", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.BurnChecked]: {
                        maxAmount: 1_000_000n,
                        allowedMints: [MINT],
                    },
                },
            });

            // Valid
            const ix1 = getBurnCheckedInstruction({
                account: TOKEN_ACCOUNT,
                mint: MINT,
                authority: SIGNER,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix1))).toBe(true);

            // Invalid amount
            const ix2 = getBurnCheckedInstruction({
                account: TOKEN_ACCOUNT,
                mint: MINT,
                authority: SIGNER,
                amount: 2_000_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix2))).toContain("exceeds limit");

            // Invalid mint
            const ix3 = getBurnCheckedInstruction({
                account: TOKEN_ACCOUNT,
                mint: ANOTHER_MINT,
                authority: SIGNER,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix3))).toContain("not in allowlist");
        });
    });

    describe("SetAuthority validation", () => {
        it("should allow authority type in allowlist", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.SetAuthority]: {
                        allowedAuthorityTypes: [0, 1], // MintTokens, FreezeAccount
                    },
                },
            });

            const ix = getSetAuthorityInstruction({
                owned: TOKEN_ACCOUNT,
                owner: SIGNER,
                authorityType: 0,
                newAuthority: DELEGATE,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject authority type not in allowlist", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.SetAuthority]: {
                        allowedAuthorityTypes: [0, 1],
                    },
                },
            });

            const ix = getSetAuthorityInstruction({
                owned: TOKEN_ACCOUNT,
                owner: SIGNER,
                authorityType: 2, // AccountOwner
                newAuthority: DELEGATE,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("not in allowlist");
        });
    });

    describe("Revoke validation", () => {
        it("should allow revoke when account and owner are allowlisted", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.Revoke]: {
                        allowedSources: [TOKEN_ACCOUNT],
                        allowedOwners: [SIGNER],
                    },
                },
            });

            const ix = getRevokeInstruction({
                source: TOKEN_ACCOUNT,
                owner: SIGNER,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject revoke when owner not in allowlist", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.Revoke]: {
                        allowedOwners: [SIGNER],
                    },
                },
            });

            const ix = getRevokeInstruction({
                source: TOKEN_ACCOUNT,
                owner: ANOTHER_OWNER,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("owner");
            expect(result).toContain("not in allowlist");
        });
    });

    describe("CloseAccount validation", () => {
        it("should enforce destination and owner allowlists", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.CloseAccount]: {
                        allowedAccounts: [TOKEN_ACCOUNT],
                        allowedDestinations: [DESTINATION],
                        allowedOwners: [SIGNER],
                    },
                },
            });

            const ix = getCloseAccountInstruction({
                account: TOKEN_ACCOUNT,
                destination: DESTINATION,
                owner: SIGNER,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);

            const disallowed = getCloseAccountInstruction({
                account: TOKEN_ACCOUNT,
                destination: ANOTHER_DESTINATION,
                owner: SIGNER,
            });
            const disallowedResult = await policy.validate(createMockContext(disallowed));
            expect(disallowedResult).toContain("destination");
            expect(disallowedResult).toContain("not in allowlist");
        });
    });

    describe("Freeze/Thaw validation", () => {
        it("should enforce freeze allowlists", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.FreezeAccount]: {
                        allowedAccounts: [TOKEN_ACCOUNT],
                        allowedMints: [MINT],
                        allowedAuthorities: [SIGNER],
                    },
                },
            });

            const ix = getFreezeAccountInstruction({
                account: TOKEN_ACCOUNT,
                mint: MINT,
                owner: SIGNER,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);

            const badAuthority = getFreezeAccountInstruction({
                account: TOKEN_ACCOUNT,
                mint: MINT,
                owner: ANOTHER_OWNER,
            });
            const badResult = await policy.validate(createMockContext(badAuthority));
            expect(badResult).toContain("authority");
        });

        it("should enforce thaw allowlists", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.ThawAccount]: {
                        allowedAccounts: [TOKEN_ACCOUNT],
                        allowedMints: [MINT],
                        allowedAuthorities: [SIGNER],
                    },
                },
            });

            const ix = getThawAccountInstruction({
                account: TOKEN_ACCOUNT,
                mint: MINT,
                owner: SIGNER,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);

            const badMint = getThawAccountInstruction({
                account: TOKEN_ACCOUNT,
                mint: ANOTHER_MINT,
                owner: SIGNER,
            });
            const badResult = await policy.validate(createMockContext(badMint));
            expect(badResult).toContain("mint");
            expect(badResult).toContain("not in allowlist");
        });
    });

    describe("custom validators", () => {
        it("should run program-level custom validator", async () => {
            let customValidatorCalled = false;
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.Transfer]: {
                        maxAmount: 1_000_000n,
                    },
                },
                customValidator: () => {
                    customValidatorCalled = true;
                    return true;
                },
            });

            const ix = getTransferInstruction({
                source: TOKEN_ACCOUNT,
                destination: DESTINATION,
                authority: SIGNER,
                amount: 500_000n,
            });

            await policy.validate(createMockContext(ix));
            expect(customValidatorCalled).toBe(true);
        });

        it("should not run custom validator if validation fails", async () => {
            let customValidatorCalled = false;
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.Transfer]: {
                        maxAmount: 1_000_000n,
                    },
                },
                customValidator: () => {
                    customValidatorCalled = true;
                    return true;
                },
            });

            const ix = getTransferInstruction({
                source: TOKEN_ACCOUNT,
                destination: DESTINATION,
                authority: SIGNER,
                amount: 2_000_000n,
            });

            await policy.validate(createMockContext(ix));
            expect(customValidatorCalled).toBe(false);
        });

        it("should return custom validator error", async () => {
            const policy = createSplTokenValidator({
                instructions: {
                    [TokenInstruction.Transfer]: true,
                },
                customValidator: () => "Custom validation failed",
            });

            const ix = getTransferInstruction({
                source: TOKEN_ACCOUNT,
                destination: DESTINATION,
                authority: SIGNER,
                amount: 1000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe("Custom validation failed");
        });
    });
});
