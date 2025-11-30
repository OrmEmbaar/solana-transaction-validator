import { describe, it, expect } from "vitest";
import { createToken2022Policy, Token2022Instruction } from "../token-2022.js";
import type { InstructionPolicyContext } from "../../types.js";
import { address, type Address, type Instruction } from "@solana/kit";
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
} from "@solana-program/token-2022";

// Valid base58 addresses
const SIGNER = address("11111111111111111111111111111112");
const TOKEN_ACCOUNT = address("11111111111111111111111111111113");
const DESTINATION = address("11111111111111111111111111111114");
const MINT = address("11111111111111111111111111111115");
const ANOTHER_MINT = address("11111111111111111111111111111116");
const DELEGATE = address("11111111111111111111111111111117");
const ANOTHER_DELEGATE = address("11111111111111111111111111111118");

// Helper to create a mock instruction context
const createMockContext = (instruction: Instruction): InstructionPolicyContext => {
    return {
        signer: SIGNER,
        transaction: {} as InstructionPolicyContext["transaction"],
        decompiledMessage: {} as InstructionPolicyContext["decompiledMessage"],
        instruction: instruction as InstructionPolicyContext["instruction"],
        instructionIndex: 0,
    };
};

describe("createToken2022Policy", () => {
    describe("instruction allowlist", () => {
        it("should deny instruction when not in config", async () => {
            const policy = createToken2022Policy({
                instructions: {},
            });

            const ix = getTransferInstruction({
                source: {
                    address: TOKEN_ACCOUNT,
                    role: 0,
                } as any,
                destination: DESTINATION,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 1000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("Transfer instruction not allowed");
        });

        it("should explicitly deny instruction when set to false", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.Transfer]: false,
                },
            });

            const ix = getTransferInstruction({
                source: { address: TOKEN_ACCOUNT, role: 0 } as any,
                destination: DESTINATION,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 1000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("explicitly denied");
        });

        it("should allow instruction when set to true", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.Transfer]: true,
                },
            });

            const ix = getTransferInstruction({
                source: { address: TOKEN_ACCOUNT, role: 0 } as any,
                destination: DESTINATION,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 1000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should allow instruction with custom validator function", async () => {
            let validatorCalled = false;
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.Transfer]: async () => {
                        validatorCalled = true;
                        return true;
                    },
                },
            });

            const ix = getTransferInstruction({
                source: { address: TOKEN_ACCOUNT, role: 0 } as any,
                destination: DESTINATION,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 1000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
            expect(validatorCalled).toBe(true);
        });
    });

    describe("Transfer validation", () => {
        it("should allow transfer within limit", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.Transfer]: {
                        maxAmount: 1_000_000n,
                    },
                },
            });

            const ix = getTransferInstruction({
                source: { address: TOKEN_ACCOUNT, role: 0 } as any,
                destination: DESTINATION,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 500_000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject transfer exceeding limit", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.Transfer]: {
                        maxAmount: 1_000_000n,
                    },
                },
            });

            const ix = getTransferInstruction({
                source: { address: TOKEN_ACCOUNT, role: 0 } as any,
                destination: DESTINATION,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 2_000_000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("exceeds limit");
        });
    });

    describe("TransferChecked validation", () => {
        it("should allow transfer with valid mint", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.TransferChecked]: {
                        allowedMints: [MINT],
                    },
                },
            });

            const ix = getTransferCheckedInstruction({
                source: { address: TOKEN_ACCOUNT, role: 0 } as any,
                mint: MINT,
                destination: DESTINATION,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 1000n,
                decimals: 6,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject transfer with non-allowed mint", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.TransferChecked]: {
                        allowedMints: [MINT],
                    },
                },
            });

            const ix = getTransferCheckedInstruction({
                source: { address: TOKEN_ACCOUNT, role: 0 } as any,
                mint: ANOTHER_MINT,
                destination: DESTINATION,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 1000n,
                decimals: 6,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("not in allowlist");
        });

        it("should enforce both amount and mint constraints", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.TransferChecked]: {
                        maxAmount: 1_000_000n,
                        allowedMints: [MINT],
                    },
                },
            });

            // Valid
            const ix1 = getTransferCheckedInstruction({
                source: { address: TOKEN_ACCOUNT, role: 0 } as any,
                mint: MINT,
                destination: DESTINATION,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix1))).toBe(true);

            // Invalid amount
            const ix2 = getTransferCheckedInstruction({
                source: { address: TOKEN_ACCOUNT, role: 0 } as any,
                mint: MINT,
                destination: DESTINATION,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 2_000_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix2))).toContain("exceeds limit");

            // Invalid mint
            const ix3 = getTransferCheckedInstruction({
                source: { address: TOKEN_ACCOUNT, role: 0 } as any,
                mint: ANOTHER_MINT,
                destination: DESTINATION,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix3))).toContain("not in allowlist");
        });
    });

    describe("Approve validation", () => {
        it("should allow approve within limit", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.Approve]: {
                        maxAmount: 1_000_000n,
                    },
                },
            });

            const ix = getApproveInstruction({
                account: { address: TOKEN_ACCOUNT, role: 0 } as any,
                delegate: DELEGATE,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 500_000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject approve exceeding limit", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.Approve]: {
                        maxAmount: 1_000_000n,
                    },
                },
            });

            const ix = getApproveInstruction({
                account: { address: TOKEN_ACCOUNT, role: 0 } as any,
                delegate: DELEGATE,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 2_000_000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("exceeds limit");
        });

        it("should allow approve to allowed delegate", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.Approve]: {
                        allowedDelegates: [DELEGATE],
                    },
                },
            });

            const ix = getApproveInstruction({
                account: { address: TOKEN_ACCOUNT, role: 0 } as any,
                delegate: DELEGATE,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 1000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject approve to non-allowed delegate", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.Approve]: {
                        allowedDelegates: [DELEGATE],
                    },
                },
            });

            const ix = getApproveInstruction({
                account: { address: TOKEN_ACCOUNT, role: 0 } as any,
                delegate: ANOTHER_DELEGATE,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 1000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("not in allowlist");
        });
    });

    describe("ApproveChecked validation", () => {
        it("should enforce all constraints", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.ApproveChecked]: {
                        maxAmount: 1_000_000n,
                        allowedMints: [MINT],
                        allowedDelegates: [DELEGATE],
                    },
                },
            });

            // Valid
            const ix1 = getApproveCheckedInstruction({
                account: { address: TOKEN_ACCOUNT, role: 0 } as any,
                mint: MINT,
                delegate: DELEGATE,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix1))).toBe(true);

            // Invalid amount
            const ix2 = getApproveCheckedInstruction({
                account: { address: TOKEN_ACCOUNT, role: 0 } as any,
                mint: MINT,
                delegate: DELEGATE,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 2_000_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix2))).toContain("exceeds limit");

            // Invalid mint
            const ix3 = getApproveCheckedInstruction({
                account: { address: TOKEN_ACCOUNT, role: 0 } as any,
                mint: ANOTHER_MINT,
                delegate: DELEGATE,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix3))).toContain("not in allowlist");

            // Invalid delegate
            const ix4 = getApproveCheckedInstruction({
                account: { address: TOKEN_ACCOUNT, role: 0 } as any,
                mint: MINT,
                delegate: ANOTHER_DELEGATE,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix4))).toContain("not in allowlist");
        });
    });

    describe("MintTo validation", () => {
        it("should allow mint within limit", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.MintTo]: {
                        maxAmount: 1_000_000n,
                    },
                },
            });

            const ix = getMintToInstruction({
                mint: MINT,
                token: TOKEN_ACCOUNT,
                mintAuthority: { address: SIGNER, role: 3 } as any,
                amount: 500_000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject mint exceeding limit", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.MintTo]: {
                        maxAmount: 1_000_000n,
                    },
                },
            });

            const ix = getMintToInstruction({
                mint: MINT,
                token: TOKEN_ACCOUNT,
                mintAuthority: { address: SIGNER, role: 3 } as any,
                amount: 2_000_000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("exceeds limit");
        });

        it("should allow mint to allowed mint", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.MintTo]: {
                        allowedMints: [MINT],
                    },
                },
            });

            const ix = getMintToInstruction({
                mint: MINT,
                token: TOKEN_ACCOUNT,
                mintAuthority: { address: SIGNER, role: 3 } as any,
                amount: 1000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject mint to non-allowed mint", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.MintTo]: {
                        allowedMints: [MINT],
                    },
                },
            });

            const ix = getMintToInstruction({
                mint: ANOTHER_MINT,
                token: TOKEN_ACCOUNT,
                mintAuthority: { address: SIGNER, role: 3 } as any,
                amount: 1000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("not in allowlist");
        });
    });

    describe("MintToChecked validation", () => {
        it("should enforce amount and mint constraints", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.MintToChecked]: {
                        maxAmount: 1_000_000n,
                        allowedMints: [MINT],
                    },
                },
            });

            // Valid
            const ix1 = getMintToCheckedInstruction({
                mint: MINT,
                token: TOKEN_ACCOUNT,
                mintAuthority: { address: SIGNER, role: 3 } as any,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix1))).toBe(true);

            // Invalid amount
            const ix2 = getMintToCheckedInstruction({
                mint: MINT,
                token: TOKEN_ACCOUNT,
                mintAuthority: { address: SIGNER, role: 3 } as any,
                amount: 2_000_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix2))).toContain("exceeds limit");

            // Invalid mint
            const ix3 = getMintToCheckedInstruction({
                mint: ANOTHER_MINT,
                token: TOKEN_ACCOUNT,
                mintAuthority: { address: SIGNER, role: 3 } as any,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix3))).toContain("not in allowlist");
        });
    });

    describe("Burn validation", () => {
        it("should allow burn within limit", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.Burn]: {
                        maxAmount: 1_000_000n,
                    },
                },
            });

            const ix = getBurnInstruction({
                account: TOKEN_ACCOUNT,
                mint: MINT,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 500_000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject burn exceeding limit", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.Burn]: {
                        maxAmount: 1_000_000n,
                    },
                },
            });

            const ix = getBurnInstruction({
                account: TOKEN_ACCOUNT,
                mint: MINT,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 2_000_000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("exceeds limit");
        });
    });

    describe("BurnChecked validation", () => {
        it("should enforce amount and mint constraints", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.BurnChecked]: {
                        maxAmount: 1_000_000n,
                        allowedMints: [MINT],
                    },
                },
            });

            // Valid
            const ix1 = getBurnCheckedInstruction({
                account: TOKEN_ACCOUNT,
                mint: MINT,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix1))).toBe(true);

            // Invalid amount
            const ix2 = getBurnCheckedInstruction({
                account: TOKEN_ACCOUNT,
                mint: MINT,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 2_000_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix2))).toContain("exceeds limit");

            // Invalid mint
            const ix3 = getBurnCheckedInstruction({
                account: TOKEN_ACCOUNT,
                mint: ANOTHER_MINT,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 500_000n,
                decimals: 6,
            });
            expect(await policy.validate(createMockContext(ix3))).toContain("not in allowlist");
        });
    });

    describe("SetAuthority validation", () => {
        it("should allow authority type in allowlist", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.SetAuthority]: {
                        allowedAuthorityTypes: [0, 1], // MintTokens, FreezeAccount
                    },
                },
            });

            const ix = getSetAuthorityInstruction({
                account: TOKEN_ACCOUNT,
                currentAuthority: { address: SIGNER, role: 3 } as any,
                authorityType: 0,
                newAuthority: DELEGATE,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe(true);
        });

        it("should reject authority type not in allowlist", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.SetAuthority]: {
                        allowedAuthorityTypes: [0, 1],
                    },
                },
            });

            const ix = getSetAuthorityInstruction({
                account: TOKEN_ACCOUNT,
                currentAuthority: { address: SIGNER, role: 3 } as any,
                authorityType: 2, // AccountOwner
                newAuthority: DELEGATE,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toContain("not in allowlist");
        });
    });

    describe("custom validators", () => {
        it("should run program-level custom validator", async () => {
            let customValidatorCalled = false;
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.Transfer]: {
                        maxAmount: 1_000_000n,
                    },
                },
                customValidator: () => {
                    customValidatorCalled = true;
                    return true;
                },
            });

            const ix = getTransferInstruction({
                source: { address: TOKEN_ACCOUNT, role: 0 } as any,
                destination: DESTINATION,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 500_000n,
            });

            await policy.validate(createMockContext(ix));
            expect(customValidatorCalled).toBe(true);
        });

        it("should not run custom validator if validation fails", async () => {
            let customValidatorCalled = false;
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.Transfer]: {
                        maxAmount: 1_000_000n,
                    },
                },
                customValidator: () => {
                    customValidatorCalled = true;
                    return true;
                },
            });

            const ix = getTransferInstruction({
                source: { address: TOKEN_ACCOUNT, role: 0 } as any,
                destination: DESTINATION,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 2_000_000n,
            });

            await policy.validate(createMockContext(ix));
            expect(customValidatorCalled).toBe(false);
        });

        it("should return custom validator error", async () => {
            const policy = createToken2022Policy({
                instructions: {
                    [Token2022Instruction.Transfer]: true,
                },
                customValidator: () => "Custom validation failed",
            });

            const ix = getTransferInstruction({
                source: { address: TOKEN_ACCOUNT, role: 0 } as any,
                destination: DESTINATION,
                owner: { address: SIGNER, role: 3 } as any,
                amount: 1000n,
            });

            const result = await policy.validate(createMockContext(ix));
            expect(result).toBe("Custom validation failed");
        });
    });
});

