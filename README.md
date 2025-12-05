# solana-transaction-validator

Declarative transaction validation for Solana remote signers. Define exactly what your keys can sign with a type-safe, composable policy engine built for `@solana/kit`.

**Secure by default:** Programs and instructions are denied unless explicitly allowed.

## Features

- **Declarative Policy**: Define rules using simple configuration objects.
- **Type-Safe**: Full TypeScript support for all programs and instructions.
- **Composable**: Mix and match validators for different programs.
- **Secure Defaults**: Strict allowlist approach — everything is denied unless explicitly allowed.
- **Comprehensive Support**: Built-in validators for System, SPL Token, Token-2022, Compute Budget, and Memo programs.
- **Customizable**: Add custom validation logic with full access to parsed instruction data.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
    - [Minimal Example](#minimal-example)
    - [Real-World Example](#real-world-example)
- [Global Policy](#global-policy)
    - [Address Lookup Tables](#address-lookup-tables)
- [Program Validators](#program-validators)
    - [System Program](#system-program)
    - [SPL Token & Token-2022](#spl-token--token-2022)
    - [Compute Budget](#compute-budget)
    - [Memo](#memo)
- [Custom Programs](#custom-programs)
- [Instruction Configuration](#instruction-configuration)
- [Custom Validation Callbacks](#custom-validation-callbacks)
    - [Basic Example: Conditional Logic](#basic-example-conditional-logic)
    - [Using ValidationContext](#using-validationcontext)
    - [Async Operations: Database Lookups](#async-operations-database-lookups)
    - [Complex Multi-Condition Validation](#complex-multi-condition-validation)
    - [Stateful Validation with Counters](#stateful-validation-with-counters)
    - [Combining Declarative + Callback](#combining-declarative--callback)
    - [Return Values](#return-values)
    - [Type Safety](#type-safety)
- [Required Programs](#required-programs)
- [Error Handling](#error-handling)
- [Advanced Patterns](#advanced-patterns)
    - [Multi-Program Composition](#multi-program-composition)
    - [Transaction Input Formats](#transaction-input-formats)
- [API Reference](#api-reference)
    - [Core Types](#core-types)
    - [Built-in Validators](#built-in-validators)
- [Contributing](#contributing)
- [License](#license)

## Installation

```bash
npm install solana-transaction-validator
```

Requires `@solana/kit` as a peer dependency.

## Quick Start

### Minimal Example

The absolute minimum to get started:

```typescript
import {
    createTransactionValidator,
    createSystemProgramValidator,
    SignerRole,
    SystemInstruction,
} from "solana-transaction-validator";

// Treasury wallet that ONLY pays fees, never participates in transactions
const validator = createTransactionValidator({
    global: { signerRole: SignerRole.FeePayerOnly },
    programs: [
        createSystemProgramValidator({
            instructions: {
                [SystemInstruction.TransferSol]: true, // Allow SOL transfers
            },
        }),
    ],
});

// Validate before signing
await validator(wireTransaction, signerAddress);
```

### Real-World Example

A hot wallet that can only send small amounts to a treasury address:

```typescript
import { address } from "@solana/kit";
import {
    createTransactionValidator,
    createSystemProgramValidator,
    createComputeBudgetValidator,
    SignerRole,
    SystemInstruction,
    ComputeBudgetInstruction,
} from "solana-transaction-validator";

const TREASURY = address("Treasury111111111111111111111111111111111111");

const hotWalletValidator = createTransactionValidator({
    global: {
        signerRole: SignerRole.Any,
        maxInstructions: 10,
    },
    programs: [
        // System Program: Only small transfers to treasury
        createSystemProgramValidator({
            instructions: {
                // Declarative config: Simple and readable
                [SystemInstruction.TransferSol]: {
                    maxLamports: 100_000_000n, // Max 0.1 SOL per transfer
                    allowedDestinations: [TREASURY],
                },
                [SystemInstruction.CreateAccount]: false, // Explicitly forbidden
                // All other instructions denied by default (secure by default)
            },
        }),
        // Compute Budget: Required for all transactions
        createComputeBudgetValidator({
            instructions: {
                [ComputeBudgetInstruction.SetComputeUnitLimit]: {
                    maxUnits: 1_400_000,
                },
                [ComputeBudgetInstruction.SetComputeUnitPrice]: true,
            },
            required: true, // Must be present
        }),
    ],
});

// Use the validator
try {
    await hotWalletValidator(wireTransaction, signerAddress);
    // Transaction passed all checks - safe to sign
} catch (error) {
    // ValidationError thrown with specific reason
    console.error("Rejected:", error.message);
}
```

**Need custom logic?** Use callback validators for full programmatic control:

```typescript
createSystemProgramValidator({
    instructions: {
        [SystemInstruction.TransferSol]: async (ctx, parsed) => {
            // parsed is fully typed as ParsedTransferSolInstruction
            const { amount } = parsed.data;
            const { destination } = parsed.accounts;

            // Custom validation logic
            if (amount > 100_000_000n) {
                return "Transfer exceeds 0.1 SOL limit";
            }
            if (destination.address !== TREASURY) {
                return "Can only send to treasury";
            }

            // Add time-based checks, logging, database lookups, etc.
            return true; // Allow
        },
    },
});
```

See [Custom Validation Callbacks](#custom-validation-callbacks) for more examples.

## Global Policy

The global policy controls high-level transaction properties.

```typescript
global: {
    // REQUIRED: Role the signer plays in the transaction
    // - FeePayerOnly: Signer must be fee payer, cannot be a participant in instructions
    // - ParticipantOnly: Signer must be a participant, cannot be fee payer
    // - Any: No restrictions
    signerRole: SignerRole.FeePayerOnly,

    // Optional: Instruction count limits
    minInstructions: 1, // Default: 1 (prevents empty transactions)
    maxInstructions: 10,

    // Optional: Allowed transaction versions
    allowedVersions: [0], // Default: [0] (v0 transactions only). Use ['legacy'] for legacy.

    // Optional: Address Lookup Table (ALT) policy (v0 only)
    addressLookupTables: false, // Default: false (deny all ALTs)
}
```

### Address Lookup Tables

You can configure detailed ALT rules:

```typescript
addressLookupTables: {
    allowedTables: [address("TrustedTable1111111111111111111111111111111")],
    maxTables: 2,
    maxIndexedAccounts: 32,
}
```

## Program Validators

### System Program

Validates native SOL transfers, account creation, and nonce operations.

```typescript
createSystemProgramValidator({
    instructions: {
        // Simple allow/deny
        [SystemInstruction.AdvanceNonceAccount]: true,
        [SystemInstruction.UpgradeNonceAccount]: false,

        // Configuration object
        [SystemInstruction.TransferSol]: {
            maxLamports: 5_000_000_000n,
        },
        [SystemInstruction.CreateAccount]: {
            maxLamports: 10_000_000n,
            maxSpace: 1000n,
            allowedOwnerPrograms: [address("MyProgram11111111111111111111111111111111")],
        },
    },
});
```

### SPL Token & Token-2022

Validates token operations. Both `createSplTokenValidator` and `createToken2022Validator` share the same configuration structure.

```typescript
createSplTokenValidator({
    instructions: {
        [TokenInstruction.TransferChecked]: {
            maxAmount: 1_000_000n,
            allowedMints: [address("USDC...")],
        },
        [TokenInstruction.MintTo]: {
            maxAmount: 500n,
            allowedMints: [address("MyToken...")],
        },
        [TokenInstruction.Burn]: true,
        [TokenInstruction.FreezeAccount]: {
            allowedAuthorities: [address("MyAuthority...")],
        },
    },
});
```

### Compute Budget

Control compute unit limits and pricing.

```typescript
import {
    createComputeBudgetValidator,
    ComputeBudgetInstruction,
} from "solana-transaction-validator";

createComputeBudgetValidator({
    instructions: {
        [ComputeBudgetInstruction.SetComputeUnitLimit]: {
            maxUnits: 1_400_000,
        },
        [ComputeBudgetInstruction.SetComputeUnitPrice]: {
            maxMicroLamportsPerCu: 1_000_000n,
        },
    },
    required: true, // Enforce that compute budget instructions are present
});
```

### Memo

Validate memo content and length.

```typescript
import { createMemoValidator, MemoInstruction } from "solana-transaction-validator";

createMemoValidator({
    instructions: {
        [MemoInstruction.Memo]: {
            maxLength: 256,
            requiredPrefix: "app:",
        },
    },
});
```

## Custom Programs

For programs without built-in validators, use `createCustomProgramValidator`. This allows you to define rules based on instruction discriminators.

```typescript
import { createCustomProgramValidator } from "solana-transaction-validator";

createCustomProgramValidator({
    programAddress: address("MyCustomProgram1111111111111111111111111"),
    instructions: [
        // Allow instruction with specific 8-byte discriminator (e.g., Anchor)
        {
            discriminator: new Uint8Array([0x9a, 0x5c, 0x1b, 0x3d, 0x8f, 0x2e, 0x7a, 0x4c]),
        },
        // Allow instruction with 1-byte discriminator
        {
            discriminator: new Uint8Array([1]),
        },
        // Allow with custom validation logic
        {
            discriminator: new Uint8Array([2]),
            validate: async (ctx, ix) => {
                // Inspect raw instruction data
                if (ix.data.length > 100) return "Data too long";
                return true;
            },
        },
    ],
});
```

## Instruction Configuration

Each instruction can be configured in five ways:

| Config                 | Behavior                                                                                       |
| :--------------------- | :--------------------------------------------------------------------------------------------- |
| `undefined` (omitted)  | **Denied** (Implicit). Secure by default.                                                      |
| `false`                | **Denied** (Explicit). Use this to document known but forbidden instructions.                  |
| `true`                 | **Allowed**. No constraints on parameters.                                                     |
| `{ ...config }`        | **Allowed with Constraints**. Checks parameters against the config object (e.g., `maxAmount`). |
| `(ctx, parsed) => ...` | **Custom Logic**. Full programmatic control with typed parsed data.                            |

## Custom Validation Callbacks

For maximum flexibility, use callback functions instead of declarative config. Callbacks receive the `ValidationContext` and the fully typed `parsed` instruction, giving you complete programmatic control.

> **Note:** Examples below use placeholder constants like `TREASURY_ADDRESS`, `USDC_MINT`, etc. Define these as `Address` values using `address("...")` from `@solana/kit`.

### Basic Example: Conditional Logic

```typescript
createSystemProgramValidator({
    instructions: {
        [SystemInstruction.TransferSol]: async (ctx, parsed) => {
            // 'parsed' is fully typed as ParsedTransferSolInstruction
            const { amount } = parsed.data;
            const { destination } = parsed.accounts;

            // TypeScript knows exact types:
            // - amount: bigint
            // - destination.address: Address

            // High-value transfers need extra approval
            if (amount > 1_000_000_000n && destination.address !== TREASURY_ADDRESS) {
                return "Transfers over 1 SOL must go to treasury";
            }

            return true; // Allow
        },
    },
});
```

### Using ValidationContext

Access transaction-wide information through the `ValidationContext`:

```typescript
createSplTokenValidator({
    instructions: {
        [TokenInstruction.TransferChecked]: async (ctx, parsed) => {
            // Check if this signer is allowed to transfer
            if (ctx.signer === RESTRICTED_WALLET) {
                return "This wallet is restricted from token transfers";
            }

            // Inspect the full transaction
            const instructionCount = ctx.decompiledMessage.instructions.length;
            if (instructionCount > 3) {
                return "Token transfers not allowed in complex transactions";
            }

            // Access other instructions in the transaction
            const hasComputeBudget = ctx.decompiledMessage.instructions.some(
                (ix) => ix.programAddress === COMPUTE_BUDGET_PROGRAM_ADDRESS,
            );
            if (!hasComputeBudget) {
                return "Token transfers must include compute budget instructions";
            }

            return true;
        },
    },
});
```

### Async Operations: Database Lookups

```typescript
createSystemProgramValidator({
    instructions: {
        [SystemInstruction.TransferSol]: async (ctx, parsed) => {
            const recipient = parsed.accounts.destination.address;

            // Async database lookup
            const isBlacklisted = await checkBlacklist(recipient);
            if (isBlacklisted) {
                return `Recipient ${recipient} is blacklisted`;
            }

            // Check rate limits
            const recentTransfers = await getRecentTransfers(ctx.signer);
            if (recentTransfers.length > 10) {
                return "Rate limit exceeded: max 10 transfers per hour";
            }

            return true;
        },
    },
});
```

### Complex Multi-Condition Validation

```typescript
createSystemProgramValidator({
    instructions: {
        [SystemInstruction.CreateAccount]: async (ctx, parsed) => {
            const { lamports, space, programAddress } = parsed.data;
            const { payer } = parsed.accounts;

            // Multi-step validation with detailed error messages
            if (lamports > 10_000_000n) {
                return "CreateAccount: Cannot fund accounts with more than 0.01 SOL";
            }

            if (space > 10_000n) {
                return "CreateAccount: Space allocation too large (max 10KB)";
            }

            // Allowlist owner programs
            const allowedPrograms = [TOKEN_PROGRAM_ADDRESS, TOKEN_2022_PROGRAM_ADDRESS];
            if (!allowedPrograms.includes(programAddress)) {
                return `CreateAccount: Owner program ${programAddress} not in allowlist`;
            }

            // Ensure payer matches expected wallet
            if (payer.address !== ctx.signer) {
                return "CreateAccount: Payer must be the signer";
            }

            return true;
        },
    },
});
```

### Stateful Validation with Counters

```typescript
// Track approvals per session
const approvalCounts = new Map<Address, bigint>();

createSplTokenValidator({
    instructions: {
        [TokenInstruction.Approve]: async (ctx, parsed) => {
            const { delegate } = parsed.accounts;
            const { amount } = parsed.data;

            // Track total approved amount per delegate
            const currentTotal = approvalCounts.get(delegate.address) ?? 0n;
            const newTotal = currentTotal + amount;

            if (newTotal > 1_000_000n) {
                return `Delegate ${delegate.address} would exceed approval limit`;
            }

            // Update counter on success
            approvalCounts.set(delegate.address, newTotal);
            return true;
        },
    },
});
```

### Combining Declarative + Callback

You can also use callbacks alongside declarative config in the same validator:

```typescript
createSystemProgramValidator({
    instructions: {
        // Declarative: Simple and readable
        [SystemInstruction.AdvanceNonceAccount]: true,

        // Declarative with config
        [SystemInstruction.TransferSol]: {
            maxLamports: 5_000_000_000n,
        },

        // Custom callback: Full control when needed
        [SystemInstruction.CreateAccount]: async (ctx, parsed) => {
            // Complex logic here
            return myCustomValidation(ctx, parsed);
        },
    },
});
```

### Return Values

Callbacks can return three types of values:

```typescript
// ✅ Allow
return true;

// ❌ Deny with generic message
return false;

// ❌ Deny with specific reason (recommended)
return "Transfer amount exceeds daily limit";
```

### Type Safety

All callbacks are fully typed based on the instruction:

```typescript
createSystemProgramValidator({
    instructions: {
        [SystemInstruction.TransferSol]: async (ctx, parsed) => {
            // parsed: ParsedTransferSolInstruction
            // TypeScript autocomplete shows:
            // - parsed.data.amount: bigint
            // - parsed.accounts.source.address: Address
            // - parsed.accounts.destination.address: Address
        },
        [SystemInstruction.CreateAccount]: async (ctx, parsed) => {
            // parsed: ParsedCreateAccountInstruction (different type!)
            // - parsed.data.lamports: bigint
            // - parsed.data.space: bigint
            // - parsed.data.programAddress: Address
            // - parsed.accounts.payer.address: Address
        },
    },
});
```

## Required Programs

You can enforce that specific programs or instructions must be present in the transaction.

```typescript
createSystemProgramValidator({
    instructions: { /* ... */ },
    // Simple requirement: Program must be present
    required: true,

    // Specific requirement: Program must be present AND contain these instructions
    // required: [SystemInstruction.TransferSol],
}),
```

## Error Handling

The validator throws a `ValidationError` when validation fails. Always wrap validation calls in try-catch:

```typescript
import { ValidationError } from "solana-transaction-validator";

try {
    await validator(wireTransaction, signerAddress);
    // Transaction passed all checks - safe to sign
    await signAndSendTransaction(transaction);
} catch (error) {
    if (error instanceof ValidationError) {
        // Validation failed with a specific reason
        console.error("Transaction rejected:", error.message);
        // Examples:
        // - "Global policy rejected transaction"
        // - "Instruction 2 uses unauthorized program ..."
        // - "System Program: TransferSol amount 2000000000 exceeds limit 1000000000"
    } else {
        // Other error (network, parsing, etc.)
        throw error;
    }
}
```

## Advanced Patterns

### Multi-Program Composition

Combine validators for complex use cases:

```typescript
const validator = createTransactionValidator({
    global: {
        signerRole: SignerRole.FeePayerOnly,
        maxInstructions: 10,
    },
    programs: [
        // Allow specific System Program operations
        createSystemProgramValidator({
            instructions: {
                [SystemInstruction.TransferSol]: { maxLamports: 1_000_000_000n },
            },
        }),
        // Require compute budget in all transactions
        createComputeBudgetValidator({
            instructions: {
                [ComputeBudgetInstruction.SetComputeUnitLimit]: {
                    maxUnits: 1_400_000,
                },
                [ComputeBudgetInstruction.SetComputeUnitPrice]: true,
            },
            required: true,
        }),
        // Allow token transfers with strict limits
        createSplTokenValidator({
            instructions: {
                [TokenInstruction.TransferChecked]: {
                    maxAmount: 100_000n,
                    allowedMints: [USDC_MINT],
                },
            },
        }),
        // Custom program with discriminator-based allowlisting
        createCustomProgramValidator({
            programAddress: MY_PROTOCOL_PROGRAM,
            instructions: [
                { discriminator: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]) },
            ],
        }),
    ],
});
```

### Transaction Input Formats

The validator accepts three input formats:

```typescript
// 1. Base64 string (most common - from wallets)
await validator("AQABAgMEBQYH...", signerAddress);

// 2. Raw bytes (Uint8Array)
await validator(transactionBytes, signerAddress);

// 3. Transaction object (most efficient - skip decoding)
import { getTransactionDecoder } from "@solana/kit";
const transaction = getTransactionDecoder().decode(transactionBytes);
await validator(transaction, signerAddress);
```

## API Reference

### Core Types

- **`TransactionValidator`**: The main validation function returned by `createTransactionValidator`.
- **`ValidationContext`**: Context object passed to custom callbacks containing:
    - `signer`: Address - The public key attempting to sign
    - `transaction`: Transaction - The full transaction object
    - `decompiledMessage`: DecompiledTransactionMessage - High-level view with resolved addresses
    - `compiledMessage`: CompiledTransactionMessage - Low-level view with account indices
- **`ValidationResult`**: Return type for validators (`true` | `false` | `string`)
- **`ValidationError`**: Error thrown when validation fails

### Built-in Validators

| Function                       | Program                       | Enum                       |
| :----------------------------- | :---------------------------- | :------------------------- |
| `createSystemProgramValidator` | System Program                | `SystemInstruction`        |
| `createSplTokenValidator`      | SPL Token                     | `TokenInstruction`         |
| `createToken2022Validator`     | Token Extensions (Token-2022) | `Token2022Instruction`     |
| `createComputeBudgetValidator` | Compute Budget                | `ComputeBudgetInstruction` |
| `createMemoValidator`          | Memo                          | `MemoInstruction`          |
| `createCustomProgramValidator` | Custom/Unknown Programs       | N/A                        |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
