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
} from "@solana-program/token";
import type {
    InstructionPolicy,
    InstructionPolicyContext,
    PolicyResult,
    ProgramPolicyConfig,
} from "../types.js";
import { runCustomValidator } from "./utils.js";

// Re-export for convenience
export { TOKEN_PROGRAM_ADDRESS, TokenInstruction };

// Program-specific context type
export type SplTokenPolicyContext = InstructionPolicyContext<typeof TOKEN_PROGRAM_ADDRESS>;

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
    // Simple operations - no additional config
    [TokenInstruction.Revoke]: NoConstraintsConfig;
    [TokenInstruction.CloseAccount]: NoConstraintsConfig;
    [TokenInstruction.FreezeAccount]: NoConstraintsConfig;
    [TokenInstruction.ThawAccount]: NoConstraintsConfig;
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
export type SplTokenPolicyConfig = ProgramPolicyConfig<
    typeof TOKEN_PROGRAM_ADDRESS,
    TokenInstruction,
    TokenInstructionConfigs
>;

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
 * @returns An InstructionPolicy that validates SPL Token instructions
 *
 * @example
 * ```typescript
 * const tokenPolicy = createSplTokenPolicy({
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
 * });
 * ```
 */
export function createSplTokenPolicy(config: SplTokenPolicyConfig): InstructionPolicy {
    return {
        async validate(ctx: InstructionPolicyContext): Promise<PolicyResult> {
            // Assert this is a valid Token Program instruction with data and accounts
            assertIsInstructionForProgram(ctx.instruction, TOKEN_PROGRAM_ADDRESS);
            assertIsInstructionWithData(ctx.instruction);
            assertIsInstructionWithAccounts(ctx.instruction);

            // After assertions, context is now typed for SPL Token Program
            const typedCtx = ctx as SplTokenPolicyContext;
            const ix = typedCtx.instruction as ValidatedInstruction;

            // Identify the instruction type
            const ixType = identifyTokenInstruction(ix.data);
            const ixConfig = config.instructions[ixType];

            // 1. Deny: undefined or false
            if (ixConfig === undefined || ixConfig === false) {
                const reason = ixConfig === false ? "explicitly denied" : "not allowed";
                return `SPL Token: ${TokenInstruction[ixType]} instruction ${reason}`;
            }

            // 2. Allow all: true
            if (ixConfig === true) {
                return runCustomValidator(config.customValidator, typedCtx);
            }

            // 3. Custom validator: function
            if (typeof ixConfig === "function") {
                const result = await ixConfig(typedCtx);
                if (result !== true) return result;
                return runCustomValidator(config.customValidator, typedCtx);
            }

            // 4. Declarative config: object
            const validationResult = validateInstruction(ixType, ixConfig, ix);
            if (validationResult !== true) return validationResult;
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
    | NoConstraintsConfig;

function validateInstruction(
    ixType: TokenInstruction,
    ixConfig: InstructionConfig,
    ix: ValidatedInstruction,
): PolicyResult {
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

        // Simple operations - no additional validation needed
        case TokenInstruction.Revoke:
        case TokenInstruction.CloseAccount:
        case TokenInstruction.FreezeAccount:
        case TokenInstruction.ThawAccount:
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

function validateTransfer(config: TransferConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseTransferInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `SPL Token: Transfer amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    // Note: Transfer instruction doesn't include mint, can't validate allowedMints
    // Use TransferChecked for mint validation

    return true;
}

function validateTransferChecked(config: TransferConfig, ix: ValidatedInstruction): PolicyResult {
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

function validateApprove(config: ApproveConfig, ix: ValidatedInstruction): PolicyResult {
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

function validateApproveChecked(config: ApproveConfig, ix: ValidatedInstruction): PolicyResult {
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

function validateMintTo(config: MintToConfig, ix: ValidatedInstruction): PolicyResult {
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

function validateMintToChecked(config: MintToConfig, ix: ValidatedInstruction): PolicyResult {
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

function validateBurn(config: BurnConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseBurnInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `SPL Token: Burn amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    // Note: Burn instruction doesn't include mint in a way we can easily validate
    // Use BurnChecked for mint validation

    return true;
}

function validateBurnChecked(config: BurnConfig, ix: ValidatedInstruction): PolicyResult {
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

function validateSetAuthority(config: SetAuthorityConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseSetAuthorityInstruction(ix);

    if (config.allowedAuthorityTypes !== undefined) {
        const authorityType = parsed.data.authorityType;
        if (!config.allowedAuthorityTypes.includes(authorityType)) {
            return `SPL Token: SetAuthority type ${authorityType} not in allowlist`;
        }
    }

    return true;
}
