// ============================================================================
// Types
// ============================================================================

export type {
    TransactionInput,
    ValidationContext,
    ValidationResult,
    InstructionCallback,
    InstructionConfigEntry,
    GlobalPolicyConfig,
    GlobalValidator,
    InstructionValidator,
    ProgramValidator,
} from "./types.js";

export { SignerRole } from "./types.js";

// ============================================================================
// Errors
// ============================================================================

export { ValidationError } from "./errors.js";

// ============================================================================
// Engine
// ============================================================================

export {
    createTransactionValidator,
    type TransactionValidatorConfig,
    type TransactionValidator,
} from "./engine.js";

// ============================================================================
// Global Policies
// ============================================================================

export { validateGlobalPolicy } from "./global/validator.js";
export { validateSignerRole } from "./global/signer-role.js";
export {
    validateTransactionLimits,
    type TransactionLimitsConfig,
} from "./global/transaction-limits.js";
export { validateTransactionVersion } from "./global/version-validation.js";
export {
    validateAddressLookups,
    type AddressLookupConfig,
} from "./global/address-lookup-validation.js";
export type { TransactionVersion } from "@solana/kit";

// ============================================================================
// Program Policies
// ============================================================================

// Utilities
export { arraysEqual, hasPrefix } from "./programs/utils.js";

// Custom Program (for programs without @solana-program/* packages)
export {
    createCustomProgramValidator,
    type CustomProgramPolicyConfig,
    type DiscriminatorRule,
} from "./programs/custom-program.js";

// System Program
export {
    createSystemProgramValidator,
    SYSTEM_PROGRAM_ADDRESS,
    SystemInstruction,
    type SystemProgramPolicyConfig,
    type TransferSolConfig,
    type CreateAccountConfig,
    type AssignConfig,
    type AllocateConfig,
    type AdvanceNonceAccountConfig,
    type WithdrawNonceAccountConfig,
    type InitializeNonceAccountConfig,
    type AuthorizeNonceAccountConfig,
    type UpgradeNonceAccountConfig,
} from "./programs/system-program.js";

// SPL Token
export {
    createSplTokenValidator,
    TOKEN_PROGRAM_ADDRESS,
    TokenInstruction,
    type SplTokenPolicyConfig,
    type TransferConfig as SplTokenTransferConfig,
    type ApproveConfig as SplTokenApproveConfig,
    type MintToConfig as SplTokenMintToConfig,
    type BurnConfig as SplTokenBurnConfig,
    type SetAuthorityConfig as SplTokenSetAuthorityConfig,
    type CloseAccountConfig as SplTokenCloseAccountConfig,
    type FreezeThawConfig as SplTokenFreezeThawConfig,
    type RevokeConfig as SplTokenRevokeConfig,
} from "./programs/spl-token.js";

// Token-2022
export {
    createToken2022Validator,
    TOKEN_2022_PROGRAM_ADDRESS,
    Token2022Instruction,
    type Token2022PolicyConfig,
    type TransferConfig as Token2022TransferConfig,
    type ApproveConfig as Token2022ApproveConfig,
    type MintToConfig as Token2022MintToConfig,
    type BurnConfig as Token2022BurnConfig,
    type SetAuthorityConfig as Token2022SetAuthorityConfig,
    type CloseAccountConfig as Token2022CloseAccountConfig,
    type FreezeThawConfig as Token2022FreezeThawConfig,
    type RevokeConfig as Token2022RevokeConfig,
} from "./programs/token-2022.js";

// Compute Budget
export {
    createComputeBudgetValidator,
    COMPUTE_BUDGET_PROGRAM_ADDRESS,
    ComputeBudgetInstruction,
    type ComputeBudgetPolicyConfig,
    type SetComputeUnitLimitConfig,
    type SetComputeUnitPriceConfig,
    type RequestHeapFrameConfig,
    type SetLoadedAccountsDataSizeLimitConfig,
} from "./programs/compute-budget.js";

// Memo
export {
    createMemoValidator,
    MEMO_PROGRAM_ADDRESS,
    MemoInstruction,
    type MemoPolicyConfig,
    type MemoConfig,
} from "./programs/memo.js";
