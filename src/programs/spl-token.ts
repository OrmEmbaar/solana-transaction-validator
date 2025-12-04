import {
    type Address,
    type Instruction,
    type InstructionWithAccounts,
    type InstructionWithData,
    type AccountMeta,
    assertIsInstructionForProgram,
    assertIsInstructionWithData,
    assertIsInstructionWithAccounts,
} from "@solana/kit";
import {
    TOKEN_PROGRAM_ADDRESS,
    TokenInstruction,
    identifyTokenInstruction,
    parseTransferInstruction,
    parseTransferCheckedInstruction,
    parseApproveInstruction,
    parseApproveCheckedInstruction,
    parseMintToInstruction,
    parseMintToCheckedInstruction,
    parseBurnInstruction,
    parseBurnCheckedInstruction,
    parseSetAuthorityInstruction,
    parseRevokeInstruction,
    parseCloseAccountInstruction,
    parseFreezeAccountInstruction,
    parseThawAccountInstruction,
} from "@solana-program/token";
import type {
    ParsedTransferInstruction,
    ParsedTransferCheckedInstruction,
    ParsedApproveInstruction,
    ParsedApproveCheckedInstruction,
    ParsedMintToInstruction,
    ParsedMintToCheckedInstruction,
    ParsedBurnInstruction,
    ParsedBurnCheckedInstruction,
    ParsedSetAuthorityInstruction,
    ParsedRevokeInstruction,
    ParsedCloseAccountInstruction,
    ParsedFreezeAccountInstruction,
    ParsedThawAccountInstruction,
} from "@solana-program/token";
import type {
    ValidationContext,
    ValidationResult,
    ProgramValidator,
    InstructionCallback,
} from "../types.js";

// Re-export for convenience
export { TOKEN_PROGRAM_ADDRESS, TokenInstruction };

// Type for a fully validated instruction
type ValidatedInstruction = Instruction &
    InstructionWithData<Uint8Array> &
    InstructionWithAccounts<readonly AccountMeta[]>;

// ============================================================================
// Per-instruction config types
// ============================================================================

/** Config for Transfer and TransferChecked instructions */
export interface TransferConfig {
    /** Maximum transfer amount */
    maxAmount?: bigint;
    /** Allowlist of token mints */
    allowedMints?: Address[];
}

/** Config for Approve and ApproveChecked instructions */
export interface ApproveConfig {
    /** Maximum approval amount */
    maxAmount?: bigint;
    /** Allowlist of token mints */
    allowedMints?: Address[];
    /** Allowlist of delegate addresses */
    allowedDelegates?: Address[];
}

/** Config for MintTo and MintToChecked instructions */
export interface MintToConfig {
    /** Maximum mint amount */
    maxAmount?: bigint;
    /** Allowlist of token mints */
    allowedMints?: Address[];
}

/** Config for Burn and BurnChecked instructions */
export interface BurnConfig {
    /** Maximum burn amount */
    maxAmount?: bigint;
    /** Allowlist of token mints */
    allowedMints?: Address[];
}

/** Config for SetAuthority instruction */
export interface SetAuthorityConfig {
    /** Allowlist of authority types that can be changed */
    allowedAuthorityTypes?: number[];
}

/** Config for CloseAccount instruction */
export interface CloseAccountConfig {
    /** Allowlist of token accounts that can be closed */
    allowedAccounts?: Address[];
    /** Allowlist of destinations for reclaimed lamports */
    allowedDestinations?: Address[];
    /** Allowlist of owners allowed to close accounts */
    allowedOwners?: Address[];
}

/** Config for FreezeAccount/ThawAccount instructions */
export interface FreezeThawConfig {
    /** Allowlist of token accounts that can be frozen/thawed */
    allowedAccounts?: Address[];
    /** Allowlist of mints that can be affected */
    allowedMints?: Address[];
    /** Allowlist of freeze authorities permitted to act */
    allowedAuthorities?: Address[];
}

/** Config for Revoke instruction */
export interface RevokeConfig {
    /** Allowlist of token accounts whose delegates can be revoked */
    allowedSources?: Address[];
    /** Allowlist of owners permitted to perform revoke */
    allowedOwners?: Address[];
}

/** Empty config for instructions with no additional constraints */
export type NoConstraintsConfig = Record<string, never>;

// ============================================================================
// Typed instruction callbacks
// ============================================================================

export type TransferCallback = InstructionCallback<ParsedTransferInstruction>;
export type TransferCheckedCallback = InstructionCallback<ParsedTransferCheckedInstruction>;
export type ApproveCallback = InstructionCallback<ParsedApproveInstruction>;
export type ApproveCheckedCallback = InstructionCallback<ParsedApproveCheckedInstruction>;
export type MintToCallback = InstructionCallback<ParsedMintToInstruction>;
export type MintToCheckedCallback = InstructionCallback<ParsedMintToCheckedInstruction>;
export type BurnCallback = InstructionCallback<ParsedBurnInstruction>;
export type BurnCheckedCallback = InstructionCallback<ParsedBurnCheckedInstruction>;
export type SetAuthorityCallback = InstructionCallback<ParsedSetAuthorityInstruction>;
export type RevokeCallback = InstructionCallback<ParsedRevokeInstruction>;
export type CloseAccountCallback = InstructionCallback<ParsedCloseAccountInstruction>;
export type FreezeAccountCallback = InstructionCallback<ParsedFreezeAccountInstruction>;
export type ThawAccountCallback = InstructionCallback<ParsedThawAccountInstruction>;

// ============================================================================
// Main config type
// ============================================================================

/** Config entry for a single instruction: boolean, declarative config, or typed callback */
type InstructionEntry<TConfig, TCallback> = undefined | boolean | TConfig | TCallback;

/**
 * Configuration for the SPL Token Program policy.
 *
 * Each instruction type can be:
 * - Omitted: instruction is implicitly DENIED
 * - `false`: instruction is explicitly DENIED (self-documenting)
 * - `true`: instruction is ALLOWED with no constraints
 * - Config object: instruction is ALLOWED with declarative constraints
 * - Function: instruction is ALLOWED with custom validation logic (receives typed parsed instruction)
 */
export interface SplTokenPolicyConfig {
    /**
     * Per-instruction configuration with typed callbacks.
     */
    instructions: {
        [TokenInstruction.Transfer]?: InstructionEntry<TransferConfig, TransferCallback>;
        [TokenInstruction.TransferChecked]?: InstructionEntry<
            TransferConfig,
            TransferCheckedCallback
        >;
        [TokenInstruction.Approve]?: InstructionEntry<ApproveConfig, ApproveCallback>;
        [TokenInstruction.ApproveChecked]?: InstructionEntry<ApproveConfig, ApproveCheckedCallback>;
        [TokenInstruction.MintTo]?: InstructionEntry<MintToConfig, MintToCallback>;
        [TokenInstruction.MintToChecked]?: InstructionEntry<MintToConfig, MintToCheckedCallback>;
        [TokenInstruction.Burn]?: InstructionEntry<BurnConfig, BurnCallback>;
        [TokenInstruction.BurnChecked]?: InstructionEntry<BurnConfig, BurnCheckedCallback>;
        [TokenInstruction.SetAuthority]?: InstructionEntry<
            SetAuthorityConfig,
            SetAuthorityCallback
        >;
        [TokenInstruction.Revoke]?: InstructionEntry<RevokeConfig, RevokeCallback>;
        [TokenInstruction.CloseAccount]?: InstructionEntry<
            CloseAccountConfig,
            CloseAccountCallback
        >;
        [TokenInstruction.FreezeAccount]?: InstructionEntry<
            FreezeThawConfig,
            FreezeAccountCallback
        >;
        [TokenInstruction.ThawAccount]?: InstructionEntry<FreezeThawConfig, ThawAccountCallback>;
        // Simple operations - just allow/deny, no config
        [TokenInstruction.SyncNative]?: boolean;
        [TokenInstruction.InitializeMint]?: boolean;
        [TokenInstruction.InitializeMint2]?: boolean;
        [TokenInstruction.InitializeAccount]?: boolean;
        [TokenInstruction.InitializeAccount2]?: boolean;
        [TokenInstruction.InitializeAccount3]?: boolean;
        [TokenInstruction.InitializeMultisig]?: boolean;
        [TokenInstruction.InitializeMultisig2]?: boolean;
        [TokenInstruction.InitializeImmutableOwner]?: boolean;
        [TokenInstruction.GetAccountDataSize]?: boolean;
        [TokenInstruction.AmountToUiAmount]?: boolean;
        [TokenInstruction.UiAmountToAmount]?: boolean;
    };

    /**
     * Requirements for this program in the transaction.
     * - `true`: Program MUST be present in the transaction.
     * - `TokenInstruction[]`: Program MUST be present AND contain these instruction types.
     * - `undefined`: Program is optional (policy runs only if present).
     */
    required?: boolean | TokenInstruction[];
}

// ============================================================================
// Policy implementation
// ============================================================================

/**
 * Creates a policy for the SPL Token Program.
 *
 * Uses the official @solana-program/token package for instruction identification
 * and parsing, ensuring accurate discriminator matching and data extraction.
 *
 * @param config - The SPL Token policy configuration
 * @returns A ProgramValidator that validates SPL Token instructions
 *
 * @example
 * ```typescript
 * const tokenPolicy = createSplTokenValidator({
 *     instructions: {
 *         // Declarative: use built-in constraints
 *         [TokenInstruction.Transfer]: {
 *             maxAmount: 1_000_000n,
 *         },
 *         // Custom: full control with a typed callback
 *         [TokenInstruction.TransferChecked]: async (ctx, instruction) => {
 *             // instruction is fully typed as ParsedTransferCheckedInstruction
 *             // - instruction.data.amount (bigint)
 *             // - instruction.accounts.mint.address
 *             return true;
 *         },
 *         // Simple allow
 *         [TokenInstruction.Burn]: true,
 *         // Explicit deny
 *         [TokenInstruction.SetAuthority]: false,
 *     },
 *     required: true, // This program must be present in the transaction
 * });
 * ```
 */
export function createSplTokenValidator(config: SplTokenPolicyConfig): ProgramValidator {
    return {
        programAddress: TOKEN_PROGRAM_ADDRESS,
        required: config.required,
        async validate(
            ctx: ValidationContext,
            instruction: Instruction,
        ): Promise<ValidationResult> {
            // Assert this is a valid Token Program instruction with data and accounts
            assertIsInstructionForProgram(instruction, TOKEN_PROGRAM_ADDRESS);
            assertIsInstructionWithData(instruction);
            assertIsInstructionWithAccounts(instruction);

            const ix = instruction as ValidatedInstruction;

            // Identify the instruction type
            const ixType = identifyTokenInstruction(ix.data);
            const ixConfig = config.instructions[ixType];

            // Deny: undefined or false
            if (ixConfig === undefined || ixConfig === false) {
                const reason = ixConfig === false ? "explicitly denied" : "not allowed";
                return `SPL Token: ${TokenInstruction[ixType]} instruction ${reason}`;
            }

            // Allow all: true
            if (ixConfig === true) {
                return true;
            }

            // Look up the handler for this instruction type
            const handler = instructionHandlers[ixType];
            if (!handler) {
                return `SPL Token: Unknown instruction type ${ixType}`;
            }

            // Get the validator: user-provided callback or our built-in declarative validator
            const validate =
                typeof ixConfig === "function" ? ixConfig : handler.createValidator(ixConfig);

            // Parse and validate
            return await validate(ctx, handler.parse(ix));
        },
    };
}

// ============================================================================
// Instruction handler registry
// ============================================================================

/**
 * Handler for a single instruction type.
 * Pairs the parser with the declarative validator factory.
 *
 * Type safety is maintained at the handler definition level - each handler
 * is created with correctly typed functions. The registry uses `any` because
 * this is inherently a runtime dispatch point where we look up handlers by
 * instruction discriminator.
 */
interface InstructionHandler {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse: (ix: ValidatedInstruction) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createValidator: (config: any) => InstructionCallback<any>;
}

/**
 * Registry of all instruction handlers.
 * Each entry pairs the parser function with the declarative validator factory.
 */
const instructionHandlers: Partial<Record<TokenInstruction, InstructionHandler>> = {
    [TokenInstruction.Transfer]: {
        parse: parseTransferInstruction,
        createValidator: createTransferValidator,
    },
    [TokenInstruction.TransferChecked]: {
        parse: parseTransferCheckedInstruction,
        createValidator: createTransferCheckedValidator,
    },
    [TokenInstruction.Approve]: {
        parse: parseApproveInstruction,
        createValidator: createApproveValidator,
    },
    [TokenInstruction.ApproveChecked]: {
        parse: parseApproveCheckedInstruction,
        createValidator: createApproveCheckedValidator,
    },
    [TokenInstruction.MintTo]: {
        parse: parseMintToInstruction,
        createValidator: createMintToValidator,
    },
    [TokenInstruction.MintToChecked]: {
        parse: parseMintToCheckedInstruction,
        createValidator: createMintToCheckedValidator,
    },
    [TokenInstruction.Burn]: {
        parse: parseBurnInstruction,
        createValidator: createBurnValidator,
    },
    [TokenInstruction.BurnChecked]: {
        parse: parseBurnCheckedInstruction,
        createValidator: createBurnCheckedValidator,
    },
    [TokenInstruction.SetAuthority]: {
        parse: parseSetAuthorityInstruction,
        createValidator: createSetAuthorityValidator,
    },
    [TokenInstruction.Revoke]: {
        parse: parseRevokeInstruction,
        createValidator: createRevokeValidator,
    },
    [TokenInstruction.CloseAccount]: {
        parse: parseCloseAccountInstruction,
        createValidator: createCloseAccountValidator,
    },
    [TokenInstruction.FreezeAccount]: {
        parse: parseFreezeAccountInstruction,
        createValidator: createFreezeAccountValidator,
    },
    [TokenInstruction.ThawAccount]: {
        parse: parseThawAccountInstruction,
        createValidator: createThawAccountValidator,
    },
};

// --- Transfer validators ---
function createTransferValidator(config: TransferConfig): TransferCallback {
    return (_ctx, parsed) => {
        if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
            return `SPL Token: Transfer amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
        }
        // Note: Transfer instruction doesn't include mint, can't validate allowedMints
        // Use TransferChecked for mint validation
        return true;
    };
}

function createTransferCheckedValidator(config: TransferConfig): TransferCheckedCallback {
    return (_ctx, parsed) => {
        if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
            return `SPL Token: TransferChecked amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
        }
        if (config.allowedMints !== undefined) {
            if (!config.allowedMints.includes(parsed.accounts.mint.address)) {
                return `SPL Token: TransferChecked mint ${parsed.accounts.mint.address} not in allowlist`;
            }
        }
        return true;
    };
}

// --- Approve validators ---
function createApproveValidator(config: ApproveConfig): ApproveCallback {
    return (_ctx, parsed) => {
        if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
            return `SPL Token: Approve amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
        }
        if (config.allowedDelegates !== undefined) {
            if (!config.allowedDelegates.includes(parsed.accounts.delegate.address)) {
                return `SPL Token: Approve delegate ${parsed.accounts.delegate.address} not in allowlist`;
            }
        }
        // Note: Approve instruction doesn't include mint, can't validate allowedMints
        return true;
    };
}

function createApproveCheckedValidator(config: ApproveConfig): ApproveCheckedCallback {
    return (_ctx, parsed) => {
        if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
            return `SPL Token: ApproveChecked amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
        }
        if (config.allowedMints !== undefined) {
            if (!config.allowedMints.includes(parsed.accounts.mint.address)) {
                return `SPL Token: ApproveChecked mint ${parsed.accounts.mint.address} not in allowlist`;
            }
        }
        if (config.allowedDelegates !== undefined) {
            if (!config.allowedDelegates.includes(parsed.accounts.delegate.address)) {
                return `SPL Token: ApproveChecked delegate ${parsed.accounts.delegate.address} not in allowlist`;
            }
        }
        return true;
    };
}

// --- MintTo validators ---
function createMintToValidator(config: MintToConfig): MintToCallback {
    return (_ctx, parsed) => {
        if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
            return `SPL Token: MintTo amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
        }
        if (config.allowedMints !== undefined) {
            if (!config.allowedMints.includes(parsed.accounts.mint.address)) {
                return `SPL Token: MintTo mint ${parsed.accounts.mint.address} not in allowlist`;
            }
        }
        return true;
    };
}

function createMintToCheckedValidator(config: MintToConfig): MintToCheckedCallback {
    return (_ctx, parsed) => {
        if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
            return `SPL Token: MintToChecked amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
        }
        if (config.allowedMints !== undefined) {
            if (!config.allowedMints.includes(parsed.accounts.mint.address)) {
                return `SPL Token: MintToChecked mint ${parsed.accounts.mint.address} not in allowlist`;
            }
        }
        return true;
    };
}

// --- Burn validators ---
function createBurnValidator(config: BurnConfig): BurnCallback {
    return (_ctx, parsed) => {
        if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
            return `SPL Token: Burn amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
        }
        // Note: Burn instruction doesn't include mint in a way we can easily validate
        return true;
    };
}

function createBurnCheckedValidator(config: BurnConfig): BurnCheckedCallback {
    return (_ctx, parsed) => {
        if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
            return `SPL Token: BurnChecked amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
        }
        if (config.allowedMints !== undefined) {
            if (!config.allowedMints.includes(parsed.accounts.mint.address)) {
                return `SPL Token: BurnChecked mint ${parsed.accounts.mint.address} not in allowlist`;
            }
        }
        return true;
    };
}

// --- Other validators ---
function createSetAuthorityValidator(config: SetAuthorityConfig): SetAuthorityCallback {
    return (_ctx, parsed) => {
        if (config.allowedAuthorityTypes !== undefined) {
            if (!config.allowedAuthorityTypes.includes(parsed.data.authorityType)) {
                return `SPL Token: SetAuthority type ${parsed.data.authorityType} not in allowlist`;
            }
        }
        return true;
    };
}

function createRevokeValidator(config: RevokeConfig): RevokeCallback {
    return (_ctx, parsed) => {
        if (config.allowedSources !== undefined) {
            if (!config.allowedSources.includes(parsed.accounts.source.address)) {
                return `SPL Token: Revoke source ${parsed.accounts.source.address} not in allowlist`;
            }
        }
        if (config.allowedOwners !== undefined) {
            if (!config.allowedOwners.includes(parsed.accounts.owner.address)) {
                return `SPL Token: Revoke owner ${parsed.accounts.owner.address} not in allowlist`;
            }
        }
        return true;
    };
}

function createCloseAccountValidator(config: CloseAccountConfig): CloseAccountCallback {
    return (_ctx, parsed) => {
        if (config.allowedAccounts !== undefined) {
            if (!config.allowedAccounts.includes(parsed.accounts.account.address)) {
                return `SPL Token: CloseAccount account ${parsed.accounts.account.address} not in allowlist`;
            }
        }
        if (config.allowedDestinations !== undefined) {
            if (!config.allowedDestinations.includes(parsed.accounts.destination.address)) {
                return `SPL Token: CloseAccount destination ${parsed.accounts.destination.address} not in allowlist`;
            }
        }
        if (config.allowedOwners !== undefined) {
            if (!config.allowedOwners.includes(parsed.accounts.owner.address)) {
                return `SPL Token: CloseAccount owner ${parsed.accounts.owner.address} not in allowlist`;
            }
        }
        return true;
    };
}

function createFreezeAccountValidator(config: FreezeThawConfig): FreezeAccountCallback {
    return (_ctx, parsed) => {
        if (config.allowedAccounts !== undefined) {
            if (!config.allowedAccounts.includes(parsed.accounts.account.address)) {
                return `SPL Token: FreezeAccount account ${parsed.accounts.account.address} not in allowlist`;
            }
        }
        if (config.allowedMints !== undefined) {
            if (!config.allowedMints.includes(parsed.accounts.mint.address)) {
                return `SPL Token: FreezeAccount mint ${parsed.accounts.mint.address} not in allowlist`;
            }
        }
        if (config.allowedAuthorities !== undefined) {
            if (!config.allowedAuthorities.includes(parsed.accounts.owner.address)) {
                return `SPL Token: FreezeAccount authority ${parsed.accounts.owner.address} not in allowlist`;
            }
        }
        return true;
    };
}

function createThawAccountValidator(config: FreezeThawConfig): ThawAccountCallback {
    return (_ctx, parsed) => {
        if (config.allowedAccounts !== undefined) {
            if (!config.allowedAccounts.includes(parsed.accounts.account.address)) {
                return `SPL Token: ThawAccount account ${parsed.accounts.account.address} not in allowlist`;
            }
        }
        if (config.allowedMints !== undefined) {
            if (!config.allowedMints.includes(parsed.accounts.mint.address)) {
                return `SPL Token: ThawAccount mint ${parsed.accounts.mint.address} not in allowlist`;
            }
        }
        if (config.allowedAuthorities !== undefined) {
            if (!config.allowedAuthorities.includes(parsed.accounts.owner.address)) {
                return `SPL Token: ThawAccount authority ${parsed.accounts.owner.address} not in allowlist`;
            }
        }
        return true;
    };
}
