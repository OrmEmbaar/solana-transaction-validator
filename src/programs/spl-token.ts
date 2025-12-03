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
    InstructionValidationContext,
    ValidationResult,
    ProgramValidator,
    ProgramPolicyConfig,
} from "../types.js";
import { runCustomValidator } from "./utils.js";

// Re-export for convenience
export { TOKEN_PROGRAM_ADDRESS, TokenInstruction };

// Program-specific context type
export type SplTokenValidationContext = InstructionValidationContext<typeof TOKEN_PROGRAM_ADDRESS>;

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
export interface RevokeSimpleConfig {
    /** Allowlist of token accounts whose delegates can be revoked */
    allowedSources?: Address[];
    /** Allowlist of owners permitted to perform revoke */
    allowedOwners?: Address[];
}

/** Empty config for instructions with no additional constraints */
export type NoConstraintsConfig = Record<string, never>;

/** Map instruction types to their config types */
export interface TokenInstructionConfigs {
    [TokenInstruction.Transfer]: TransferConfig;
    [TokenInstruction.TransferChecked]: TransferConfig;
    [TokenInstruction.Approve]: ApproveConfig;
    [TokenInstruction.ApproveChecked]: ApproveConfig;
    [TokenInstruction.MintTo]: MintToConfig;
    [TokenInstruction.MintToChecked]: MintToConfig;
    [TokenInstruction.Burn]: BurnConfig;
    [TokenInstruction.BurnChecked]: BurnConfig;
    [TokenInstruction.SetAuthority]: SetAuthorityConfig;
    // Simple operations with declarative controls
    [TokenInstruction.Revoke]: RevokeSimpleConfig;
    [TokenInstruction.CloseAccount]: CloseAccountConfig;
    [TokenInstruction.FreezeAccount]: FreezeThawConfig;
    [TokenInstruction.ThawAccount]: FreezeThawConfig;
    [TokenInstruction.SyncNative]: NoConstraintsConfig;
    // Initialization instructions
    [TokenInstruction.InitializeMint]: NoConstraintsConfig;
    [TokenInstruction.InitializeMint2]: NoConstraintsConfig;
    [TokenInstruction.InitializeAccount]: NoConstraintsConfig;
    [TokenInstruction.InitializeAccount2]: NoConstraintsConfig;
    [TokenInstruction.InitializeAccount3]: NoConstraintsConfig;
    [TokenInstruction.InitializeMultisig]: NoConstraintsConfig;
    [TokenInstruction.InitializeMultisig2]: NoConstraintsConfig;
    [TokenInstruction.InitializeImmutableOwner]: NoConstraintsConfig;
    // Other instructions
    [TokenInstruction.GetAccountDataSize]: NoConstraintsConfig;
    [TokenInstruction.AmountToUiAmount]: NoConstraintsConfig;
    [TokenInstruction.UiAmountToAmount]: NoConstraintsConfig;
}

// ============================================================================
// Main config type
// ============================================================================

/**
 * Configuration for the SPL Token Program policy.
 *
 * Each instruction type can be:
 * - Omitted: instruction is implicitly DENIED
 * - `false`: instruction is explicitly DENIED (self-documenting)
 * - `true`: instruction is ALLOWED with no constraints
 * - Config object: instruction is ALLOWED with declarative constraints
 * - Function: instruction is ALLOWED with custom validation logic
 */
export interface SplTokenPolicyConfig extends ProgramPolicyConfig<
    typeof TOKEN_PROGRAM_ADDRESS,
    TokenInstruction,
    TokenInstructionConfigs
> {
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
 *         // Custom: full control with a function
 *         [TokenInstruction.TransferChecked]: async (ctx) => {
 *             // Custom validation logic
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
        async validate(ctx: InstructionValidationContext): Promise<ValidationResult> {
            // Assert this is a valid Token Program instruction with data and accounts
            assertIsInstructionForProgram(ctx.instruction, TOKEN_PROGRAM_ADDRESS);
            assertIsInstructionWithData(ctx.instruction);
            assertIsInstructionWithAccounts(ctx.instruction);

            // After assertions, context is now typed for SPL Token Program
            const typedCtx = ctx as SplTokenValidationContext;
            const ix = typedCtx.instruction as ValidatedInstruction;

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
                return runCustomValidator(config.customValidator, typedCtx);
            }

            // Validate: function or declarative config
            let result: ValidationResult;
            if (typeof ixConfig === "function") {
                result = await ixConfig(typedCtx);
            } else {
                result = validateInstruction(ixType, ixConfig, ix);
            }

            if (result !== true) return result;
            return runCustomValidator(config.customValidator, typedCtx);
        },
    };
}

// ============================================================================
// Instruction-specific validation
// ============================================================================

type InstructionConfig =
    | TransferConfig
    | ApproveConfig
    | MintToConfig
    | BurnConfig
    | SetAuthorityConfig
    | CloseAccountConfig
    | FreezeThawConfig
    | RevokeSimpleConfig
    | NoConstraintsConfig;

function validateInstruction(
    ixType: TokenInstruction,
    ixConfig: InstructionConfig,
    ix: ValidatedInstruction,
): ValidationResult {
    switch (ixType) {
        case TokenInstruction.Transfer:
            return validateTransfer(ixConfig as TransferConfig, ix);

        case TokenInstruction.TransferChecked:
            return validateTransferChecked(ixConfig as TransferConfig, ix);

        case TokenInstruction.Approve:
            return validateApprove(ixConfig as ApproveConfig, ix);

        case TokenInstruction.ApproveChecked:
            return validateApproveChecked(ixConfig as ApproveConfig, ix);

        case TokenInstruction.MintTo:
            return validateMintTo(ixConfig as MintToConfig, ix);

        case TokenInstruction.MintToChecked:
            return validateMintToChecked(ixConfig as MintToConfig, ix);

        case TokenInstruction.Burn:
            return validateBurn(ixConfig as BurnConfig, ix);

        case TokenInstruction.BurnChecked:
            return validateBurnChecked(ixConfig as BurnConfig, ix);

        case TokenInstruction.SetAuthority:
            return validateSetAuthority(ixConfig as SetAuthorityConfig, ix);

        case TokenInstruction.Revoke:
            return validateRevoke(ixConfig as RevokeSimpleConfig, ix);

        case TokenInstruction.CloseAccount:
            return validateCloseAccount(ixConfig as CloseAccountConfig, ix);

        case TokenInstruction.FreezeAccount:
            return validateFreezeOrThaw(ixConfig as FreezeThawConfig, ix, "FreezeAccount");

        case TokenInstruction.ThawAccount:
            return validateFreezeOrThaw(ixConfig as FreezeThawConfig, ix, "ThawAccount");

        // Simple operations - no additional validation needed
        case TokenInstruction.SyncNative:
        case TokenInstruction.InitializeMint:
        case TokenInstruction.InitializeMint2:
        case TokenInstruction.InitializeAccount:
        case TokenInstruction.InitializeAccount2:
        case TokenInstruction.InitializeAccount3:
        case TokenInstruction.InitializeMultisig:
        case TokenInstruction.InitializeMultisig2:
        case TokenInstruction.InitializeImmutableOwner:
        case TokenInstruction.GetAccountDataSize:
        case TokenInstruction.AmountToUiAmount:
        case TokenInstruction.UiAmountToAmount:
            return true;

        default:
            return `SPL Token: Unknown instruction type ${ixType}`;
    }
}

function validateTransfer(config: TransferConfig, ix: ValidatedInstruction): ValidationResult {
    const parsed = parseTransferInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `SPL Token: Transfer amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    // Note: Transfer instruction doesn't include mint, can't validate allowedMints
    // Use TransferChecked for mint validation

    return true;
}

function validateTransferChecked(
    config: TransferConfig,
    ix: ValidatedInstruction,
): ValidationResult {
    const parsed = parseTransferCheckedInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `SPL Token: TransferChecked amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    if (config.allowedMints !== undefined) {
        const mint = parsed.accounts.mint.address;
        if (!config.allowedMints.includes(mint)) {
            return `SPL Token: TransferChecked mint ${mint} not in allowlist`;
        }
    }

    return true;
}

function validateApprove(config: ApproveConfig, ix: ValidatedInstruction): ValidationResult {
    const parsed = parseApproveInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `SPL Token: Approve amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    if (config.allowedDelegates !== undefined) {
        const delegate = parsed.accounts.delegate.address;
        if (!config.allowedDelegates.includes(delegate)) {
            return `SPL Token: Approve delegate ${delegate} not in allowlist`;
        }
    }

    // Note: Approve instruction doesn't include mint, can't validate allowedMints
    // Use ApproveChecked for mint validation

    return true;
}

function validateApproveChecked(config: ApproveConfig, ix: ValidatedInstruction): ValidationResult {
    const parsed = parseApproveCheckedInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `SPL Token: ApproveChecked amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    if (config.allowedMints !== undefined) {
        const mint = parsed.accounts.mint.address;
        if (!config.allowedMints.includes(mint)) {
            return `SPL Token: ApproveChecked mint ${mint} not in allowlist`;
        }
    }

    if (config.allowedDelegates !== undefined) {
        const delegate = parsed.accounts.delegate.address;
        if (!config.allowedDelegates.includes(delegate)) {
            return `SPL Token: ApproveChecked delegate ${delegate} not in allowlist`;
        }
    }

    return true;
}

function validateMintTo(config: MintToConfig, ix: ValidatedInstruction): ValidationResult {
    const parsed = parseMintToInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `SPL Token: MintTo amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    if (config.allowedMints !== undefined) {
        const mint = parsed.accounts.mint.address;
        if (!config.allowedMints.includes(mint)) {
            return `SPL Token: MintTo mint ${mint} not in allowlist`;
        }
    }

    return true;
}

function validateMintToChecked(config: MintToConfig, ix: ValidatedInstruction): ValidationResult {
    const parsed = parseMintToCheckedInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `SPL Token: MintToChecked amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    if (config.allowedMints !== undefined) {
        const mint = parsed.accounts.mint.address;
        if (!config.allowedMints.includes(mint)) {
            return `SPL Token: MintToChecked mint ${mint} not in allowlist`;
        }
    }

    return true;
}

function validateBurn(config: BurnConfig, ix: ValidatedInstruction): ValidationResult {
    const parsed = parseBurnInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `SPL Token: Burn amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    // Note: Burn instruction doesn't include mint in a way we can easily validate
    // Use BurnChecked for mint validation

    return true;
}

function validateBurnChecked(config: BurnConfig, ix: ValidatedInstruction): ValidationResult {
    const parsed = parseBurnCheckedInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `SPL Token: BurnChecked amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    if (config.allowedMints !== undefined) {
        const mint = parsed.accounts.mint.address;
        if (!config.allowedMints.includes(mint)) {
            return `SPL Token: BurnChecked mint ${mint} not in allowlist`;
        }
    }

    return true;
}

function validateSetAuthority(
    config: SetAuthorityConfig,
    ix: ValidatedInstruction,
): ValidationResult {
    const parsed = parseSetAuthorityInstruction(ix);

    if (config.allowedAuthorityTypes !== undefined) {
        const authorityType = parsed.data.authorityType;
        if (!config.allowedAuthorityTypes.includes(authorityType)) {
            return `SPL Token: SetAuthority type ${authorityType} not in allowlist`;
        }
    }

    return true;
}

function validateCloseAccount(
    config: CloseAccountConfig,
    ix: ValidatedInstruction,
): ValidationResult {
    const parsed = parseCloseAccountInstruction(ix);

    if (config.allowedAccounts !== undefined) {
        const account = parsed.accounts.account.address;
        if (!config.allowedAccounts.includes(account)) {
            return `SPL Token: CloseAccount account ${account} not in allowlist`;
        }
    }

    if (config.allowedDestinations !== undefined) {
        const destination = parsed.accounts.destination.address;
        if (!config.allowedDestinations.includes(destination)) {
            return `SPL Token: CloseAccount destination ${destination} not in allowlist`;
        }
    }

    if (config.allowedOwners !== undefined) {
        const owner = parsed.accounts.owner.address;
        if (!config.allowedOwners.includes(owner)) {
            return `SPL Token: CloseAccount owner ${owner} not in allowlist`;
        }
    }

    return true;
}

function validateFreezeOrThaw(
    config: FreezeThawConfig,
    ix: ValidatedInstruction,
    instructionName: "FreezeAccount" | "ThawAccount",
): ValidationResult {
    const parsed =
        instructionName === "FreezeAccount"
            ? parseFreezeAccountInstruction(ix)
            : parseThawAccountInstruction(ix);

    if (config.allowedAccounts !== undefined) {
        const account = parsed.accounts.account.address;
        if (!config.allowedAccounts.includes(account)) {
            return `SPL Token: ${instructionName} account ${account} not in allowlist`;
        }
    }

    if (config.allowedMints !== undefined) {
        const mint = parsed.accounts.mint.address;
        if (!config.allowedMints.includes(mint)) {
            return `SPL Token: ${instructionName} mint ${mint} not in allowlist`;
        }
    }

    if (config.allowedAuthorities !== undefined) {
        const authority = parsed.accounts.owner.address;
        if (!config.allowedAuthorities.includes(authority)) {
            return `SPL Token: ${instructionName} authority ${authority} not in allowlist`;
        }
    }

    return true;
}

function validateRevoke(config: RevokeSimpleConfig, ix: ValidatedInstruction): ValidationResult {
    const parsed = parseRevokeInstruction(ix);

    if (config.allowedSources !== undefined) {
        const source = parsed.accounts.source.address;
        if (!config.allowedSources.includes(source)) {
            return `SPL Token: Revoke source ${source} not in allowlist`;
        }
    }

    if (config.allowedOwners !== undefined) {
        const owner = parsed.accounts.owner.address;
        if (!config.allowedOwners.includes(owner)) {
            return `SPL Token: Revoke owner ${owner} not in allowlist`;
        }
    }

    return true;
}
