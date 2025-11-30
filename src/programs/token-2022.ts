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
} from "@solana-program/token-2022";
import type {
    InstructionPolicy,
    InstructionPolicyContext,
    PolicyResult,
    CustomValidationCallback,
    InstructionConfigEntry,
} from "../types.js";
import { runCustomValidator } from "./utils.js";

// Re-export for convenience
export { TOKEN_2022_PROGRAM_ADDRESS, Token2022Instruction };

// Program-specific context type
export type Token2022PolicyContext = InstructionPolicyContext<typeof TOKEN_2022_PROGRAM_ADDRESS>;

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

// ============================================================================
// Main config type
// ============================================================================

/** Union of all instruction config types */
type AnyInstructionConfig =
    | TransferConfig
    | ApproveConfig
    | MintToConfig
    | BurnConfig
    | SetAuthorityConfig
    | NoConstraintsConfig;

/**
 * Configuration for the Token-2022 Program policy.
 *
 * Each instruction type can be:
 * - Omitted: instruction is implicitly DENIED
 * - `false`: instruction is explicitly DENIED (self-documenting)
 * - `true`: instruction is ALLOWED with no constraints
 * - Config object: instruction is ALLOWED with declarative constraints
 * - Function: instruction is ALLOWED with custom validation logic
 */
export interface Token2022PolicyConfig {
    /** Per-instruction configuration. Keyed by Token2022Instruction enum value. */
    instructions: Partial<
        Record<
            Token2022Instruction,
            InstructionConfigEntry<typeof TOKEN_2022_PROGRAM_ADDRESS, AnyInstructionConfig>
        >
    >;
    /** Program-level custom validator (runs after instruction-level validation) */
    customValidator?: CustomValidationCallback<typeof TOKEN_2022_PROGRAM_ADDRESS>;
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
 * @returns An InstructionPolicy that validates Token-2022 instructions
 *
 * @example
 * ```typescript
 * const token2022Policy = createToken2022Policy({
 *     instructions: {
 *         // Declarative: use built-in constraints
 *         [Token2022Instruction.TransferChecked]: {
 *             maxAmount: 1_000_000n,
 *             allowedMints: [MY_TOKEN_MINT],
 *         },
 *         // Custom: full control with a function
 *         [Token2022Instruction.Transfer]: async (ctx) => {
 *             // Custom validation logic
 *             return true;
 *         },
 *         // Simple allow
 *         [Token2022Instruction.Burn]: true,
 *     },
 * });
 * ```
 */
export function createToken2022Policy(config: Token2022PolicyConfig): InstructionPolicy {
    return {
        async validate(ctx: InstructionPolicyContext): Promise<PolicyResult> {
            // Assert this is a valid Token-2022 Program instruction with data and accounts
            assertIsInstructionForProgram(ctx.instruction, TOKEN_2022_PROGRAM_ADDRESS);
            assertIsInstructionWithData(ctx.instruction);
            assertIsInstructionWithAccounts(ctx.instruction);

            // After assertions, context is now typed for Token-2022 Program
            const typedCtx = ctx as Token2022PolicyContext;
            const ix = typedCtx.instruction as ValidatedInstruction;

            // Identify the instruction type
            const ixType = identifyToken2022Instruction(ix.data);
            const ixConfig = config.instructions[ixType];

            // 1. Deny: undefined or false
            if (ixConfig === undefined || ixConfig === false) {
                const reason = ixConfig === false ? "explicitly denied" : "not allowed";
                return `Token-2022: ${Token2022Instruction[ixType]} instruction ${reason}`;
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
    ixType: Token2022Instruction,
    ixConfig: InstructionConfig,
    ix: ValidatedInstruction,
): PolicyResult {
    switch (ixType) {
        case Token2022Instruction.Transfer:
            return validateTransfer(ixConfig as TransferConfig, ix);

        case Token2022Instruction.TransferChecked:
            return validateTransferChecked(ixConfig as TransferConfig, ix);

        case Token2022Instruction.Approve:
            return validateApprove(ixConfig as ApproveConfig, ix);

        case Token2022Instruction.ApproveChecked:
            return validateApproveChecked(ixConfig as ApproveConfig, ix);

        case Token2022Instruction.MintTo:
            return validateMintTo(ixConfig as MintToConfig, ix);

        case Token2022Instruction.MintToChecked:
            return validateMintToChecked(ixConfig as MintToConfig, ix);

        case Token2022Instruction.Burn:
            return validateBurn(ixConfig as BurnConfig, ix);

        case Token2022Instruction.BurnChecked:
            return validateBurnChecked(ixConfig as BurnConfig, ix);

        case Token2022Instruction.SetAuthority:
            return validateSetAuthority(ixConfig as SetAuthorityConfig, ix);

        // All other instructions - no additional validation needed
        default:
            return true;
    }
}

function validateTransfer(config: TransferConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseTransferInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `Token-2022: Transfer amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    return true;
}

function validateTransferChecked(config: TransferConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseTransferCheckedInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `Token-2022: TransferChecked amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    if (config.allowedMints !== undefined) {
        const mint = parsed.accounts.mint.address;
        if (!config.allowedMints.includes(mint)) {
            return `Token-2022: TransferChecked mint ${mint} not in allowlist`;
        }
    }

    return true;
}

function validateApprove(config: ApproveConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseApproveInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `Token-2022: Approve amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    if (config.allowedDelegates !== undefined) {
        const delegate = parsed.accounts.delegate.address;
        if (!config.allowedDelegates.includes(delegate)) {
            return `Token-2022: Approve delegate ${delegate} not in allowlist`;
        }
    }

    return true;
}

function validateApproveChecked(config: ApproveConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseApproveCheckedInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `Token-2022: ApproveChecked amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    if (config.allowedMints !== undefined) {
        const mint = parsed.accounts.mint.address;
        if (!config.allowedMints.includes(mint)) {
            return `Token-2022: ApproveChecked mint ${mint} not in allowlist`;
        }
    }

    if (config.allowedDelegates !== undefined) {
        const delegate = parsed.accounts.delegate.address;
        if (!config.allowedDelegates.includes(delegate)) {
            return `Token-2022: ApproveChecked delegate ${delegate} not in allowlist`;
        }
    }

    return true;
}

function validateMintTo(config: MintToConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseMintToInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `Token-2022: MintTo amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    if (config.allowedMints !== undefined) {
        const mint = parsed.accounts.mint.address;
        if (!config.allowedMints.includes(mint)) {
            return `Token-2022: MintTo mint ${mint} not in allowlist`;
        }
    }

    return true;
}

function validateMintToChecked(config: MintToConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseMintToCheckedInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `Token-2022: MintToChecked amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    if (config.allowedMints !== undefined) {
        const mint = parsed.accounts.mint.address;
        if (!config.allowedMints.includes(mint)) {
            return `Token-2022: MintToChecked mint ${mint} not in allowlist`;
        }
    }

    return true;
}

function validateBurn(config: BurnConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseBurnInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `Token-2022: Burn amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    return true;
}

function validateBurnChecked(config: BurnConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseBurnCheckedInstruction(ix);

    if (config.maxAmount !== undefined && parsed.data.amount > config.maxAmount) {
        return `Token-2022: BurnChecked amount ${parsed.data.amount} exceeds limit ${config.maxAmount}`;
    }

    if (config.allowedMints !== undefined) {
        const mint = parsed.accounts.mint.address;
        if (!config.allowedMints.includes(mint)) {
            return `Token-2022: BurnChecked mint ${mint} not in allowlist`;
        }
    }

    return true;
}

function validateSetAuthority(config: SetAuthorityConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseSetAuthorityInstruction(ix);

    if (config.allowedAuthorityTypes !== undefined) {
        const authorityType = parsed.data.authorityType;
        if (!config.allowedAuthorityTypes.includes(authorityType)) {
            return `Token-2022: SetAuthority type ${authorityType} not in allowlist`;
        }
    }

    return true;
}
