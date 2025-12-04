import { describe, it, expect } from "vitest";
import { createSystemProgramValidator, SystemInstruction } from "../system-program.js";
import type { ValidationContext } from "../../types.js";
import { address, type Address, type Instruction } from "@solana/kit";
import {
    getTransferSolInstruction,
    getCreateAccountInstruction,
    getAssignInstruction,
    getAllocateInstruction,
    getWithdrawNonceAccountInstruction,
    getAuthorizeNonceAccountInstruction,
    getAdvanceNonceAccountInstruction,
    getUpgradeNonceAccountInstruction,
} from "@solana-program/system";

// Use valid base58 addresses (32 ones = System Program format)
const SIGNER = address("11111111111111111111111111111112");
const DESTINATION = address("11111111111111111111111111111113");
const ANOTHER_DESTINATION = address("11111111111111111111111111111114");
const PROGRAM_OWNER = address("11111111111111111111111111111115");
const ANOTHER_OWNER = address("11111111111111111111111111111116");
const NONCE_ACCOUNT = address("11111111111111111111111111111117");
const ANOTHER_NONCE_ACCOUNT = address("11111111111111111111111111111118");
const NONCE_AUTHORITY = address("11111111111111111111111111111119");
const ANOTHER_NONCE_AUTHORITY = address("1111111111111111111111111111111A");
const NEW_NONCE_AUTHORITY = address("1111111111111111111111111111111B");
const ANOTHER_NEW_NONCE_AUTHORITY = address("1111111111111111111111111111111C");

// Helper to create a mock validation context (without instruction - that's passed separately)
const createMockContext = (): ValidationContext => {
    return {
        signer: SIGNER,
        transaction: {} as ValidationContext["transaction"],
        compiledMessage: {} as ValidationContext["compiledMessage"],
        decompiledMessage: {} as ValidationContext["decompiledMessage"],
    };
};

// Helper to create a TransferSol instruction
const createTransferInstruction = (amount: bigint, destination: Address = DESTINATION) => {
    return getTransferSolInstruction({
        source: {
            address: SIGNER,
            role: 3,
        } as unknown as Parameters<typeof getTransferSolInstruction>[0]["source"],
        destination,
        amount,
    });
};

// Helper to create a CreateAccount instruction
const createCreateAccountInstruction = (
    lamports: bigint,
    space: bigint,
    programAddress: Address = PROGRAM_OWNER,
) => {
    return getCreateAccountInstruction({
        payer: {
            address: SIGNER,
            role: 3,
        } as unknown as Parameters<typeof getCreateAccountInstruction>[0]["payer"],
        newAccount: {
            address: DESTINATION,
            role: 3,
        } as unknown as Parameters<typeof getCreateAccountInstruction>[0]["newAccount"],
        lamports,
        space,
        programAddress,
    });
};

// Helper to create an Assign instruction
const createAssignInstruction = (programAddress: Address = PROGRAM_OWNER) => {
    return getAssignInstruction({
        account: {
            address: SIGNER,
            role: 3,
        } as unknown as Parameters<typeof getAssignInstruction>[0]["account"],
        programAddress,
    });
};

// Helper to create an Allocate instruction
const createAllocateInstruction = (space: bigint) => {
    return getAllocateInstruction({
        newAccount: {
            address: SIGNER,
            role: 3,
        } as unknown as Parameters<typeof getAllocateInstruction>[0]["newAccount"],
        space,
    });
};

const createWithdrawNonceInstruction = (
    withdrawAmount: bigint,
    {
        nonceAccount = NONCE_ACCOUNT,
        recipient = DESTINATION,
        authority = NONCE_AUTHORITY,
    }: {
        nonceAccount?: Address;
        recipient?: Address;
        authority?: Address;
    } = {},
) => {
    return getWithdrawNonceAccountInstruction({
        nonceAccount,
        recipientAccount: recipient,
        nonceAuthority: {
            address: authority,
            role: 3,
        } as unknown as Parameters<typeof getWithdrawNonceAccountInstruction>[0]["nonceAuthority"],
        withdrawAmount,
    });
};

const createAuthorizeNonceInstruction = (
    newAuthority: Address = NEW_NONCE_AUTHORITY,
    {
        nonceAccount = NONCE_ACCOUNT,
        authority = NONCE_AUTHORITY,
    }: { nonceAccount?: Address; authority?: Address } = {},
) => {
    return getAuthorizeNonceAccountInstruction({
        nonceAccount,
        nonceAuthority: {
            address: authority,
            role: 3,
        } as unknown as Parameters<typeof getAuthorizeNonceAccountInstruction>[0]["nonceAuthority"],
        newNonceAuthority: newAuthority,
    });
};

const createAdvanceNonceInstruction = ({
    nonceAccount = NONCE_ACCOUNT,
    authority = NONCE_AUTHORITY,
}: { nonceAccount?: Address; authority?: Address } = {}) => {
    return getAdvanceNonceAccountInstruction({
        nonceAccount,
        nonceAuthority: {
            address: authority,
            role: 3,
        } as unknown as Parameters<typeof getAdvanceNonceAccountInstruction>[0]["nonceAuthority"],
    });
};

const createUpgradeNonceInstruction = (nonceAccount: Address = NONCE_ACCOUNT) => {
    return getUpgradeNonceAccountInstruction({
        nonceAccount,
    });
};

describe("createSystemProgramValidator", () => {
    const ctx = createMockContext();

    describe("instruction allowlist", () => {
        it("should deny instruction when not in config", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    // TransferSol is omitted
                },
            });

            const ix = createTransferInstruction(1000n);
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("TransferSol instruction not allowed");
        });

        it("should allow instruction when set to true", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: true,
                },
            });

            const ix = createTransferInstruction(1000n);
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });

        it("should allow instruction when config object provided", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: {},
                },
            });

            const ix = createTransferInstruction(1000n);
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });
    });

    describe("TransferSol validation", () => {
        it("should allow transfer within limit", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: {
                        maxLamports: 1_000_000n,
                    },
                },
            });

            const ix = createTransferInstruction(500_000n);
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });

        it("should allow transfer at exact limit", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: {
                        maxLamports: 1_000_000n,
                    },
                },
            });

            const ix = createTransferInstruction(1_000_000n);
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });

        it("should reject transfer exceeding limit", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: {
                        maxLamports: 1_000_000n,
                    },
                },
            });

            const ix = createTransferInstruction(1_000_001n);
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("exceeds limit");
            expect(result).toContain("1000001");
        });

        it("should allow transfer to allowed destination", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: {
                        allowedDestinations: [DESTINATION],
                    },
                },
            });

            const ix = createTransferInstruction(1000n, DESTINATION);
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });

        it("should reject transfer to non-allowed destination", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: {
                        allowedDestinations: [DESTINATION],
                    },
                },
            });

            const ix = createTransferInstruction(1000n, ANOTHER_DESTINATION);
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("not in allowlist");
        });

        it("should enforce both amount and destination constraints", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: {
                        maxLamports: 1_000_000n,
                        allowedDestinations: [DESTINATION],
                    },
                },
            });

            // Valid amount, valid destination
            const ix1 = createTransferInstruction(500_000n, DESTINATION);
            expect(await policy.validate(ctx, ix1)).toBe(true);

            // Invalid amount
            const ix2 = createTransferInstruction(2_000_000n, DESTINATION);
            expect(await policy.validate(ctx, ix2)).toContain("exceeds limit");

            // Invalid destination
            const ix3 = createTransferInstruction(500_000n, ANOTHER_DESTINATION);
            expect(await policy.validate(ctx, ix3)).toContain("not in allowlist");
        });
    });

    describe("CreateAccount validation", () => {
        it("should allow create account within limits", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.CreateAccount]: {
                        maxLamports: 1_000_000_000n,
                        maxSpace: 1000n,
                    },
                },
            });

            const ix = createCreateAccountInstruction(500_000_000n, 500n);
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });

        it("should reject create account exceeding lamports limit", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.CreateAccount]: {
                        maxLamports: 1_000_000_000n,
                    },
                },
            });

            const ix = createCreateAccountInstruction(2_000_000_000n, 100n);
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("lamports");
            expect(result).toContain("exceeds limit");
        });

        it("should reject create account exceeding space limit", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.CreateAccount]: {
                        maxSpace: 1000n,
                    },
                },
            });

            const ix = createCreateAccountInstruction(1_000_000n, 2000n);
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("space");
            expect(result).toContain("exceeds limit");
        });

        it("should allow create account with allowed owner program", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.CreateAccount]: {
                        allowedOwnerPrograms: [PROGRAM_OWNER],
                    },
                },
            });

            const ix = createCreateAccountInstruction(1_000_000n, 100n, PROGRAM_OWNER);
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });

        it("should reject create account with non-allowed owner program", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.CreateAccount]: {
                        allowedOwnerPrograms: [PROGRAM_OWNER],
                    },
                },
            });

            const ix = createCreateAccountInstruction(1_000_000n, 100n, ANOTHER_OWNER);
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("owner program");
            expect(result).toContain("not in allowlist");
        });
    });

    describe("Assign validation", () => {
        it("should allow assign with allowed owner program", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.Assign]: {
                        allowedOwnerPrograms: [PROGRAM_OWNER],
                    },
                },
            });

            const ix = createAssignInstruction(PROGRAM_OWNER);
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });

        it("should reject assign with non-allowed owner program", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.Assign]: {
                        allowedOwnerPrograms: [PROGRAM_OWNER],
                    },
                },
            });

            const ix = createAssignInstruction(ANOTHER_OWNER);
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("owner program");
            expect(result).toContain("not in allowlist");
        });
    });

    describe("Allocate validation", () => {
        it("should allow allocate within space limit", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.Allocate]: {
                        maxSpace: 1000n,
                    },
                },
            });

            const ix = createAllocateInstruction(500n);
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });

        it("should reject allocate exceeding space limit", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.Allocate]: {
                        maxSpace: 1000n,
                    },
                },
            });

            const ix = createAllocateInstruction(2000n);
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("space");
            expect(result).toContain("exceeds limit");
        });
    });

    describe("Nonce instruction validation", () => {
        it("should enforce withdraw constraints", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.WithdrawNonceAccount]: {
                        maxLamports: 1_000n,
                        allowedRecipients: [DESTINATION],
                        allowedNonceAccounts: [NONCE_ACCOUNT],
                        allowedAuthorities: [NONCE_AUTHORITY],
                    },
                },
            });

            const ix1 = createWithdrawNonceInstruction(500n);
            expect(await policy.validate(ctx, ix1)).toBe(true);

            const ix2 = createWithdrawNonceInstruction(2_000n);
            const result = await policy.validate(ctx, ix2);
            expect(result).toContain("exceeds limit");
        });

        it("should reject withdraw to non-allowlisted destination", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.WithdrawNonceAccount]: {
                        allowedRecipients: [DESTINATION],
                    },
                },
            });

            const ix = createWithdrawNonceInstruction(100n, {
                recipient: ANOTHER_DESTINATION,
            });
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("recipient");
            expect(result).toContain("not in allowlist");
        });

        it("should enforce authorize nonce allowlists", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.AuthorizeNonceAccount]: {
                        allowedNonceAccounts: [NONCE_ACCOUNT],
                        allowedCurrentAuthorities: [NONCE_AUTHORITY],
                        allowedNewAuthorities: [NEW_NONCE_AUTHORITY],
                    },
                },
            });

            const ix1 = createAuthorizeNonceInstruction();
            expect(await policy.validate(ctx, ix1)).toBe(true);

            const disallowed = createAuthorizeNonceInstruction(ANOTHER_NEW_NONCE_AUTHORITY);
            const result = await policy.validate(ctx, disallowed);
            expect(result).toContain("new authority");
            expect(result).toContain("not in allowlist");
        });

        it("should enforce upgrade nonce account allowlist", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.UpgradeNonceAccount]: {
                        allowedNonceAccounts: [NONCE_ACCOUNT],
                    },
                },
            });

            const ix1 = createUpgradeNonceInstruction();
            expect(await policy.validate(ctx, ix1)).toBe(true);

            const ix2 = createUpgradeNonceInstruction(ANOTHER_NONCE_ACCOUNT);
            const result = await policy.validate(ctx, ix2);
            expect(result).toContain("nonce account");
            expect(result).toContain("not in allowlist");
        });

        it("should enforce advance nonce authority allowlist", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.AdvanceNonceAccount]: {
                        allowedNonceAccounts: [NONCE_ACCOUNT],
                        allowedAuthorities: [NONCE_AUTHORITY],
                    },
                },
            });

            const ix1 = createAdvanceNonceInstruction();
            expect(await policy.validate(ctx, ix1)).toBe(true);

            const ix2 = createAdvanceNonceInstruction({ authority: ANOTHER_NONCE_AUTHORITY });
            const result = await policy.validate(ctx, ix2);
            expect(result).toContain("authority");
            expect(result).toContain("not in allowlist");
        });
    });

    describe("instruction-level typed callbacks", () => {
        it("should receive correctly typed TransferSol instruction", async () => {
            let receivedAmount: bigint | undefined;
            let receivedDestination: Address | undefined;
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: async (_ctx, parsed) => {
                        receivedAmount = parsed.data.amount;
                        receivedDestination = parsed.accounts.destination.address;
                        return true;
                    },
                },
            });

            const ix = createTransferInstruction(1_234_567n, ANOTHER_DESTINATION);
            await policy.validate(ctx, ix);

            expect(receivedAmount).toBe(1_234_567n);
            expect(receivedDestination).toBe(ANOTHER_DESTINATION);
        });

        it("should receive correctly typed CreateAccount instruction", async () => {
            let receivedLamports: bigint | undefined;
            let receivedSpace: bigint | undefined;
            let receivedProgramAddress: Address | undefined;
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.CreateAccount]: async (_ctx, parsed) => {
                        receivedLamports = parsed.data.lamports;
                        receivedSpace = parsed.data.space;
                        receivedProgramAddress = parsed.data.programAddress;
                        return true;
                    },
                },
            });

            const ix = createCreateAccountInstruction(5_000_000n, 200n, ANOTHER_OWNER);
            await policy.validate(ctx, ix);

            expect(receivedLamports).toBe(5_000_000n);
            expect(receivedSpace).toBe(200n);
            expect(receivedProgramAddress).toBe(ANOTHER_OWNER);
        });

        it("should reject based on parsed instruction data", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: async (_ctx, parsed) => {
                        if (parsed.data.amount > 1_000_000n) {
                            return `Transfer amount ${parsed.data.amount} exceeds maximum`;
                        }
                        return true;
                    },
                },
            });

            const ix = createTransferInstruction(2_000_000n);
            const result = await policy.validate(ctx, ix);
            expect(result).toContain("Transfer amount 2000000 exceeds maximum");
        });

        it("should allow based on parsed instruction data", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: async (_ctx, parsed) => {
                        // Allow only transfers to specific destination
                        return parsed.accounts.destination.address === ANOTHER_DESTINATION;
                    },
                },
            });

            const allowedIx = createTransferInstruction(1000n, ANOTHER_DESTINATION);
            const deniedIx = createTransferInstruction(1000n, DESTINATION);

            expect(await policy.validate(ctx, allowedIx)).toBe(true);
            expect(await policy.validate(ctx, deniedIx)).toBe(false);
        });

        it("should pass validation context to callback", async () => {
            let receivedSigner: Address | undefined;
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: async (ctx, _parsed) => {
                        receivedSigner = ctx.signer;
                        return true;
                    },
                },
            });

            const ix = createTransferInstruction(1000n);
            await policy.validate(ctx, ix);

            expect(receivedSigner).toBe(SIGNER);
        });

        it("should support async callbacks", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: async (_ctx, _parsed) => {
                        await new Promise((resolve) => setTimeout(resolve, 10));
                        return true;
                    },
                },
            });

            const ix = createTransferInstruction(1000n);
            const result = await policy.validate(ctx, ix);
            expect(result).toBe(true);
        });

        it("should receive correctly typed AdvanceNonceAccount instruction", async () => {
            let receivedNonceAccount: Address | undefined;
            let receivedNonceAuthority: Address | undefined;
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.AdvanceNonceAccount]: async (_ctx, parsed) => {
                        receivedNonceAccount = parsed.accounts.nonceAccount.address;
                        receivedNonceAuthority = parsed.accounts.nonceAuthority.address;
                        return true;
                    },
                },
            });

            const ix = createAdvanceNonceInstruction();
            await policy.validate(ctx, ix);

            expect(receivedNonceAccount).toBe(NONCE_ACCOUNT);
            expect(receivedNonceAuthority).toBe(NONCE_AUTHORITY);
        });
    });

    describe("program address validation", () => {
        it("should throw error for instruction from wrong program", async () => {
            const policy = createSystemProgramValidator({
                instructions: {
                    [SystemInstruction.TransferSol]: true,
                },
            });

            const wrongProgramIx = {
                programAddress: address("11111111111111111111111111111117"),
                data: new Uint8Array([2, 0, 0, 0]), // TransferSol discriminator
                accounts: [],
            };

            // The assertion throws a SolanaError when program address doesn't match
            await expect(policy.validate(ctx, wrongProgramIx as Instruction)).rejects.toThrow(
                "Expected instruction",
            );
        });
    });
});
