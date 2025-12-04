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
    TOKEN_2022_PROGRAM_ADDRESS,
    Token2022Instruction,
    identifyToken2022Instruction,
    parseTransferInstruction,
    parseTransferCheckedInstruction,
    parseApproveInstruction,
    parseApproveCheckedInstruction,
    parseMintToInstruction,
    parseMintToCheckedInstruction,
    parseBurnInstruction,
    parseBurnCheckedInstruction,
    parseSetAuthorityInstruction,
    parseCloseAccountInstruction,
    parseFreezeAccountInstruction,
    parseThawAccountInstruction,
    parseRevokeInstruction,
} from "@solana-program/token-2022";
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
    ParsedCloseAccountInstruction,
    ParsedFreezeAccountInstruction,
    ParsedThawAccountInstruction,
    ParsedRevokeInstruction,
} from "@solana-program/token-2022";
import type {
    ValidationContext,
    ValidationResult,
    ProgramValidator,
    InstructionCallback,
} from "../types.js";

// Re-export for convenience
export { TOKEN_2022_PROGRAM_ADDRESS, Token2022Instruction };

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
    /** Allowlist of authorities permitted to freeze/thaw */
    allowedAuthorities?: Address[];
}

/** Config for Revoke instruction */
export interface RevokeConfig {
    /** Allowlist of token accounts whose delegates can be revoked */
    allowedSources?: Address[];
    /** Allowlist of owners permitted to issue revoke */
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
export type CloseAccountCallback = InstructionCallback<ParsedCloseAccountInstruction>;
export type FreezeAccountCallback = InstructionCallback<ParsedFreezeAccountInstruction>;
export type ThawAccountCallback = InstructionCallback<ParsedThawAccountInstruction>;
export type RevokeCallback = InstructionCallback<ParsedRevokeInstruction>;

// ============================================================================
// Main config type
// ============================================================================

/** Config entry for a single instruction: boolean, declarative config, or typed callback */
type InstructionEntry<TConfig, TCallback> = boolean | TConfig | TCallback;

/**
 * Configuration for the Token-2022 Program policy.
 *
 * Each instruction type can be:
 * - Omitted: instruction is implicitly DENIED
 * - `false`: instruction is explicitly DENIED (self-documenting)
 * - `true`: instruction is ALLOWED with no constraints
 * - Config object: instruction is ALLOWED with declarative constraints
 * - Function: instruction is ALLOWED with custom validation logic (receives typed parsed instruction)
 */
export interface Token2022PolicyConfig {
    /**
     * Per-instruction configuration with typed callbacks.
     */
    instructions: {
        [Token2022Instruction.Transfer]?: InstructionEntry<TransferConfig, TransferCallback>;
        [Token2022Instruction.TransferChecked]?: InstructionEntry<
            TransferConfig,
            TransferCheckedCallback
        >;
        [Token2022Instruction.Approve]?: InstructionEntry<ApproveConfig, ApproveCallback>;
        [Token2022Instruction.ApproveChecked]?: InstructionEntry<
            ApproveConfig,
            ApproveCheckedCallback
        >;
        [Token2022Instruction.MintTo]?: InstructionEntry<MintToConfig, MintToCallback>;
        [Token2022Instruction.MintToChecked]?: InstructionEntry<
            MintToConfig,
            MintToCheckedCallback
        >;
        [Token2022Instruction.Burn]?: InstructionEntry<BurnConfig, BurnCallback>;
        [Token2022Instruction.BurnChecked]?: InstructionEntry<BurnConfig, BurnCheckedCallback>;
        [Token2022Instruction.SetAuthority]?: InstructionEntry<
            SetAuthorityConfig,
            SetAuthorityCallback
        >;
        [Token2022Instruction.CloseAccount]?: InstructionEntry<
            CloseAccountConfig,
            CloseAccountCallback
        >;
        [Token2022Instruction.FreezeAccount]?: InstructionEntry<
            FreezeThawConfig,
            FreezeAccountCallback
        >;
        [Token2022Instruction.ThawAccount]?: InstructionEntry<
            FreezeThawConfig,
            ThawAccountCallback
        >;
        [Token2022Instruction.Revoke]?: InstructionEntry<RevokeConfig, RevokeCallback>;
        // Index signature for all other instruction types (allow/deny only)
        [key: number]: InstructionEntry<unknown, InstructionCallback<unknown>> | undefined;
    };

    /**
     * Requirements for this program in the transaction.
     * - `true`: Program MUST be present in the transaction.
     * - `Token2022Instruction[]`: Program MUST be present AND contain these instruction types.
     * - `undefined`: Program is optional (policy runs only if present).
     */
    required?: boolean | Token2022Instruction[];
}

// ============================================================================
// Policy implementation
// ============================================================================

/**
 * Creates a policy for the Token-2022 Program.
 *
 * Token-2022 is an extension of SPL Token with additional features like
 * transfer fees, confidential transfers, and more.
 *
 * @param config - The Token-2022 policy configuration
 * @returns A ProgramValidator that validates Token-2022 instructions
 *
 * @example
 * ```typescript
 * const token2022Policy = createToken2022Validator({
 *     instructions: {
 *         // Declarative: use built-in constraints
 *         [Token2022Instruction.TransferChecked]: {
 *             maxAmount: 1_000_000n,
 *             allowedMints: [MY_TOKEN_MINT],
 *         },
 *         // Custom: full control with a typed callback
 *         [Token2022Instruction.Transfer]: async (ctx, instruction) => {
 *             // instruction is fully typed as ParsedTransferInstruction
 *             return true;
 *         },
 *         // Simple allow
 *         [Token2022Instruction.Burn]: true,
 *     },
 *     required: true,
 * });
 * ```
 */
export function createToken2022Validator(config: Token2022PolicyConfig): ProgramValidator {
    return {
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        required: config.required,
        async validate(
            ctx: ValidationContext,
            instruction: Instruction,
        ): Promise<ValidationResult> {
            // Assert this is a valid Token-2022 Program instruction with data and accounts
            assertIsInstructionForProgram(instruction, TOKEN_2022_PROGRAM_ADDRESS);
            assertIsInstructionWithData(instruction);
            assertIsInstructionWithAccounts(instruction);

            const ix = instruction as ValidatedInstruction;

            // Identify the instruction type
            const ixType = identifyToken2022Instruction(ix.data);
            const ixConfig = config.instructions[ixType];

            // Deny: undefined or false
            if (ixConfig === undefined || ixConfig === false) {
                const reason = ixConfig === false ? "explicitly denied" : "not allowed";
                return `Token-2022: ${Token2022Instruction[ixType]} instruction ${reason}`;
            }

            // Allow all: true
            if (ixConfig === true) {
                return true;
            }

            // Look up the handler for this instruction type
            const handler = instructionHandlers[ixType];
            if (!handler) {
                // No handler means this instruction just passes through (like extensions)
                return true;
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
const instructionHandlers: Partial<Record<Token2022Instruction, InstructionHandler>> = {
    [Token2022Instruction.Transfer]: {
        parse: parseTransferInstruction,
        createValidator: createTransferValidator,
    },
    [Token2022Instruction.TransferChecked]: {
        parse: parseTransferCheckedInstruction,
        createValidator: createTransferCheckedValidator,
    },
    [Token2022Instruction.Approve]: {
        parse: parseApproveInstruction,
        createValidator: createApproveValidator,
    },
    [Token2022Instruction.ApproveChecked]: {
        parse: parseApproveCheckedInstruction,
        createValidator: createApproveCheckedValidator,
    },
    [Token2022Instruction.MintTo]: {
        parse: parseMintToInstruction,
        createValidator: createMintToValidator,
    },
    [Token2022Instruction.MintToChecked]: {
        parse: parseMintToCheckedInstruction,
        createValidator: createMintToCheckedValidator,
    },
    [Token2022Instruction.Burn]: {
        parse: parseBurnInstruction,
        createValidator: createBurnValidator,
    },
    [Token2022Instruction.BurnChecked]: {
        parse: parseBurnCheckedInstruction,
        createValidator: createBurnCheckedValidator,
    },
    [Token2022Instruction.SetAuthority]: {
        parse: parseSetAuthorityInstruction,
        createValidator: createSetAuthorityValidator,
    },
    [Token2022Instruction.CloseAccount]: {
        parse: parseCloseAccountInstruction,
        createValidator: createCloseAccountValidator,
    },
    [Token2022Instruction.FreezeAccount]: {
        parse: parseFreezeAccountInstruction,
        createValidator: createFreezeAccountValidator,
    },
    [Token2022Instruction.ThawAccount]: {
        parse: parseThawAccountInstruction,
        createValidator: createThawAccountValidator,
    },
    [Token2022Instruction.Revoke]: {
        parse: parseRevokeInstruction,
        createValidator: createRevokeValidator,
    },
};

// ============================================================================
// Declarative validators
// ============================================================================

function createTransferValidator(config: TransferConfig): TransferCallback {
    return (_ctx, parsed) => {
        if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
            return `Token-2022: Transfer amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
        }
        return true;
    };
}

function createTransferCheckedValidator(config: TransferConfig): TransferCheckedCallback {
    return (_ctx, parsed) => {
        if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
            return `Token-2022: TransferChecked amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
        }
        if (config.allowedMints !== undefined) {
            if (!config.allowedMints.includes(parsed.accounts.mint.address)) {
                return `Token-2022: TransferChecked mint ${parsed.accounts.mint.address} not in allowlist`;
            }
        }
        return true;
    };
}

function createApproveValidator(config: ApproveConfig): ApproveCallback {
    return (_ctx, parsed) => {
        if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
            return `Token-2022: Approve amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
        }
        if (config.allowedDelegates !== undefined) {
            if (!config.allowedDelegates.includes(parsed.accounts.delegate.address)) {
                return `Token-2022: Approve delegate ${parsed.accounts.delegate.address} not in allowlist`;
            }
        }
        return true;
    };
}

function createApproveCheckedValidator(config: ApproveConfig): ApproveCheckedCallback {
    return (_ctx, parsed) => {
        if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
            return `Token-2022: ApproveChecked amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
        }
        if (config.allowedMints !== undefined) {
            if (!config.allowedMints.includes(parsed.accounts.mint.address)) {
                return `Token-2022: ApproveChecked mint ${parsed.accounts.mint.address} not in allowlist`;
            }
        }
        if (config.allowedDelegates !== undefined) {
            if (!config.allowedDelegates.includes(parsed.accounts.delegate.address)) {
                return `Token-2022: ApproveChecked delegate ${parsed.accounts.delegate.address} not in allowlist`;
            }
        }
        return true;
    };
}

function createMintToValidator(config: MintToConfig): MintToCallback {
    return (_ctx, parsed) => {
        if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
            return `Token-2022: MintTo amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
        }
        if (config.allowedMints !== undefined) {
            if (!config.allowedMints.includes(parsed.accounts.mint.address)) {
                return `Token-2022: MintTo mint ${parsed.accounts.mint.address} not in allowlist`;
            }
        }
        return true;
    };
}

function createMintToCheckedValidator(config: MintToConfig): MintToCheckedCallback {
    return (_ctx, parsed) => {
        if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
            return `Token-2022: MintToChecked amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
        }
        if (config.allowedMints !== undefined) {
            if (!config.allowedMints.includes(parsed.accounts.mint.address)) {
                return `Token-2022: MintToChecked mint ${parsed.accounts.mint.address} not in allowlist`;
            }
        }
        return true;
    };
}

function createBurnValidator(config: BurnConfig): BurnCallback {
    return (_ctx, parsed) => {
        if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
            return `Token-2022: Burn amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
        }
        return true;
    };
}

function createBurnCheckedValidator(config: BurnConfig): BurnCheckedCallback {
    return (_ctx, parsed) => {
        if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
            return `Token-2022: BurnChecked amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
        }
        if (config.allowedMints !== undefined) {
            if (!config.allowedMints.includes(parsed.accounts.mint.address)) {
                return `Token-2022: BurnChecked mint ${parsed.accounts.mint.address} not in allowlist`;
            }
        }
        return true;
    };
}

function createSetAuthorityValidator(config: SetAuthorityConfig): SetAuthorityCallback {
    return (_ctx, parsed) => {
        if (config.allowedAuthorityTypes !== undefined) {
            if (!config.allowedAuthorityTypes.includes(parsed.data.authorityType)) {
                return `Token-2022: SetAuthority type ${parsed.data.authorityType} not in allowlist`;
            }
        }
        return true;
    };
}

function createCloseAccountValidator(config: CloseAccountConfig): CloseAccountCallback {
    return (_ctx, parsed) => {
        if (config.allowedAccounts !== undefined) {
            if (!config.allowedAccounts.includes(parsed.accounts.account.address)) {
                return `Token-2022: CloseAccount account ${parsed.accounts.account.address} not in allowlist`;
            }
        }
        if (config.allowedDestinations !== undefined) {
            if (!config.allowedDestinations.includes(parsed.accounts.destination.address)) {
                return `Token-2022: CloseAccount destination ${parsed.accounts.destination.address} not in allowlist`;
            }
        }
        if (config.allowedOwners !== undefined) {
            if (!config.allowedOwners.includes(parsed.accounts.owner.address)) {
                return `Token-2022: CloseAccount owner ${parsed.accounts.owner.address} not in allowlist`;
            }
        }
        return true;
    };
}

function createFreezeAccountValidator(config: FreezeThawConfig): FreezeAccountCallback {
    return (_ctx, parsed) => {
        if (config.allowedAccounts !== undefined) {
            if (!config.allowedAccounts.includes(parsed.accounts.account.address)) {
                return `Token-2022: FreezeAccount account ${parsed.accounts.account.address} not in allowlist`;
            }
        }
        if (config.allowedMints !== undefined) {
            if (!config.allowedMints.includes(parsed.accounts.mint.address)) {
                return `Token-2022: FreezeAccount mint ${parsed.accounts.mint.address} not in allowlist`;
            }
        }
        if (config.allowedAuthorities !== undefined) {
            if (!config.allowedAuthorities.includes(parsed.accounts.owner.address)) {
                return `Token-2022: FreezeAccount authority ${parsed.accounts.owner.address} not in allowlist`;
            }
        }
        return true;
    };
}

function createThawAccountValidator(config: FreezeThawConfig): ThawAccountCallback {
    return (_ctx, parsed) => {
        if (config.allowedAccounts !== undefined) {
            if (!config.allowedAccounts.includes(parsed.accounts.account.address)) {
                return `Token-2022: ThawAccount account ${parsed.accounts.account.address} not in allowlist`;
            }
        }
        if (config.allowedMints !== undefined) {
            if (!config.allowedMints.includes(parsed.accounts.mint.address)) {
                return `Token-2022: ThawAccount mint ${parsed.accounts.mint.address} not in allowlist`;
            }
        }
        if (config.allowedAuthorities !== undefined) {
            if (!config.allowedAuthorities.includes(parsed.accounts.owner.address)) {
                return `Token-2022: ThawAccount authority ${parsed.accounts.owner.address} not in allowlist`;
            }
        }
        return true;
    };
}

function createRevokeValidator(config: RevokeConfig): RevokeCallback {
    return (_ctx, parsed) => {
        if (config.allowedSources !== undefined) {
            if (!config.allowedSources.includes(parsed.accounts.source.address)) {
                return `Token-2022: Revoke source ${parsed.accounts.source.address} not in allowlist`;
            }
        }
        if (config.allowedOwners !== undefined) {
            if (!config.allowedOwners.includes(parsed.accounts.owner.address)) {
                return `Token-2022: Revoke owner ${parsed.accounts.owner.address} not in allowlist`;
            }
        }
        return true;
    };
}
