# solana-tx-validator

Declarative transaction policy validation for Solana remote signers. Define what transactions your keys are allowed to sign using a type-safe, composable policy engine.

## Features

- **Declarative policies** - Define allowed operations with simple configuration objects
- **Program-level validation** - Built-in support for System Program, SPL Token, Token-2022, Compute Budget, and Memo
- **Custom programs** - Easy discriminator-based allowlisting for any program
- **Global constraints** - Signer roles, transaction limits, version validation
- **Simulation validation** - Optional RPC-based constraints (compute units, account closure)
- **Type-safe** - Full TypeScript support with program-specific typing

## Installation

```bash
npm install solana-tx-validator
# or
pnpm add solana-tx-validator
```

**Peer dependencies:** This package requires `@solana/kit` to be installed in your project.

## Quick Start

```typescript
import { address } from "@solana/kit";
import {
    createTransactionValidator,
    createSystemProgramValidator,
    createComputeBudgetValidator,
    SignerRole,
    SystemInstruction,
    ComputeBudgetInstruction,
} from "solana-tx-validator";

// Define your policy
const validator = createTransactionValidator({
    // Global constraints
    global: {
        signerRole: SignerRole.FeePayerOnly, // Signer can only pay fees
        maxInstructions: 10,
        maxSignatures: 3,
    },

    // Program-specific policies (array of self-contained policies)
    programs: [
        createSystemProgramValidator({
            instructions: {
                // Allow transfers up to 1 SOL to specific addresses
                [SystemInstruction.TransferSol]: {
                    maxLamports: 1_000_000_000n,
                    allowedDestinations: [address("Treasury111111111111111111111111111111111")],
                },
                // Explicitly deny account creation
                [SystemInstruction.CreateAccount]: false,
            },
        }),

        createComputeBudgetValidator({
            instructions: {
                [ComputeBudgetInstruction.SetComputeUnitLimit]: true,
                [ComputeBudgetInstruction.SetComputeUnitPrice]: {
                    maxMicroLamportsPerCu: 100_000n,
                },
            },
        }),
    ],
});

// Validate a transaction
try {
    await validator(compiledTransaction, {
        signer: address("YourSignerPublicKey111111111111111111111"),
        principal: "user@example.com", // Optional: authenticated user
    });
    // Transaction is allowed - proceed with signing
} catch (error) {
    if (error instanceof ValidationError) {
        console.error("Policy denied:", error.message);
    }
}
```

## Core Concepts

### Policy Engine

The `createTransactionValidator` function creates a reusable validator that enforces your policies:

```typescript
const validator = createTransactionValidator({
    global: GlobalPolicyConfig,    // Required: global constraints
    programs?: ProgramPolicy[],    // Optional: array of program policies
    simulation?: SimulationConfig, // Optional: RPC-based validation
});
```

### Global Policies

Global policies apply to the entire transaction:

```typescript
global: {
    // REQUIRED: How can the signer participate?
    signerRole: SignerRole.FeePayerOnly | SignerRole.ParticipantOnly | SignerRole.Any,

    // Optional constraints
    minInstructions?: number,      // Default: 1 (prevents empty transactions)
    maxInstructions?: number,
    minSignatures?: number,
    maxSignatures?: number,
    maxAccounts?: number,          // Total accounts in transaction
    allowedSigners?: Address[],    // Allowlist of valid signers
    allowedVersions?: (0 | "legacy")[],  // Default: [0] (v0 only)

    // Address lookup tables (v0 only)
    addressLookupTables?: false | true | {
        allowedTables?: Address[],      // Allowlist of trusted tables
        maxTables?: number,             // Max tables per transaction
        maxIndexedAccounts?: number,    // Max total indexed accounts
    },  // Default: false (deny all - secure by default)
}
```

### Instruction Configuration

Each instruction can be configured as:

| Config Value          | Behavior                                                |
| --------------------- | ------------------------------------------------------- |
| `undefined` (omitted) | Instruction is **denied** (implicit)                    |
| `false`               | Instruction is **denied** (explicit, self-documenting)  |
| `true`                | Instruction is **allowed** with no constraints          |
| `{ ...config }`       | Instruction is **allowed** with declarative constraints |
| `(ctx) => ...`        | Instruction is **allowed** with custom validation logic |

```typescript
instructions: {
    [SystemInstruction.TransferSol]: {
        maxLamports: 1_000_000_000n,
        allowedDestinations: [TREASURY],
    },

    [SystemInstruction.AdvanceNonceAccount]: true,

    [SystemInstruction.CreateAccount]: false,

    [SystemInstruction.Assign]: async (ctx) => {
        // Custom logic - return true to allow, string to deny with reason
        if (someCondition) return true;
        return "Custom validation failed";
    },

    // Omitted instructions are implicitly denied
}
```

### Required Programs

Mark programs or specific instructions as required by adding `required` to the policy config:

```typescript
programs: [
    // Program must be present in the transaction
    createComputeBudgetValidator({
        instructions: {
            /* ... */
        },
        required: true,
    }),

    // Specific instructions must be present
    createSystemProgramValidator({
        instructions: {
            /* ... */
        },
        required: [SystemInstruction.TransferSol],
    }),
];
```

## Built-in Program Policies

### System Program

```typescript
import { createSystemProgramValidator, SystemInstruction } from "solana-tx-validator";

createSystemProgramValidator({
    instructions: {
        [SystemInstruction.TransferSol]: {
            maxLamports?: bigint,
            allowedDestinations?: Address[],
        },
        [SystemInstruction.CreateAccount]: {
            maxLamports?: bigint,
            maxSpace?: bigint,
            allowedOwnerPrograms?: Address[],
        },
        [SystemInstruction.InitializeNonceAccount]: {
            allowedNonceAccounts?: Address[],
            allowedNewAuthorities?: Address[],
        },
        [SystemInstruction.AdvanceNonceAccount]: {
            allowedNonceAccounts?: Address[],
            allowedAuthorities?: Address[],
        },
        [SystemInstruction.WithdrawNonceAccount]: {
            maxLamports?: bigint,
            allowedRecipients?: Address[],
            allowedNonceAccounts?: Address[],
            allowedAuthorities?: Address[],
        },
        [SystemInstruction.AuthorizeNonceAccount]: {
            allowedNonceAccounts?: Address[],
            allowedCurrentAuthorities?: Address[],
            allowedNewAuthorities?: Address[],
        },
        [SystemInstruction.UpgradeNonceAccount]: {
            allowedNonceAccounts?: Address[],
        },
        // ... other instructions
    },
    required?: boolean | SystemInstruction[],
});
```

### SPL Token & Token-2022

```typescript
import { createSplTokenValidator, TokenInstruction } from "solana-tx-validator";
import { createToken2022Validator, Token2022Instruction } from "solana-tx-validator";

createSplTokenValidator({
    instructions: {
        [TokenInstruction.Transfer]: {
            maxAmount?: bigint,
        },
        [TokenInstruction.TransferChecked]: {
            maxAmount?: bigint,
            allowedMints?: Address[],
        },
        [TokenInstruction.Approve]: {
            maxAmount?: bigint,
            allowedMints?: Address[],
            allowedDelegates?: Address[],
        },
        [TokenInstruction.Revoke]: {
            allowedSources?: Address[],
            allowedOwners?: Address[],
        },
        [TokenInstruction.CloseAccount]: {
            allowedAccounts?: Address[],
            allowedDestinations?: Address[],
            allowedOwners?: Address[],
        },
        [TokenInstruction.FreezeAccount]: {
            allowedAccounts?: Address[],
            allowedMints?: Address[],
            allowedAuthorities?: Address[],
        },
        [TokenInstruction.ThawAccount]: {
            allowedAccounts?: Address[],
            allowedMints?: Address[],
            allowedAuthorities?: Address[],
        },
        // ... other instructions
    },
    required?: boolean | TokenInstruction[],
});

// Token-2022 exposes the same config surface (Transfer, Approve, Mint/Burn, Close/Revoke/Freeze/Thaw)
createToken2022Validator({ instructions: { /* ... */ } });
```

### Compute Budget

```typescript
import { createComputeBudgetValidator, ComputeBudgetInstruction } from "solana-tx-validator";

createComputeBudgetValidator({
    instructions: {
        [ComputeBudgetInstruction.SetComputeUnitLimit]: {
            maxUnits?: number,
        },
        [ComputeBudgetInstruction.SetComputeUnitPrice]: {
            maxMicroLamportsPerCu?: bigint,
        },
        [ComputeBudgetInstruction.RequestHeapFrame]: {
            maxBytes?: number,
        },
        [ComputeBudgetInstruction.SetLoadedAccountsDataSizeLimit]: {
            maxBytes?: number,
        },
    },
    required?: boolean | ComputeBudgetInstruction[],
});
```

### Memo

```typescript
import { createMemoValidator, MemoInstruction } from "solana-tx-validator";

createMemoValidator({
    instructions: {
        [MemoInstruction.Memo]: {
            maxLength?: number,
            requiredPrefix?: string,
        },
    },
    required?: boolean,
});
```

### Custom Programs

For programs without official `@solana-program/*` packages:

```typescript
import { createCustomProgramValidator } from "solana-tx-validator";

createCustomProgramValidator({
    programAddress: address("YourProgram111111111111111111111111111111"),
    allowedInstructions: [
        { discriminator: new Uint8Array([0, 1, 2, 3]), matchMode: "prefix" },
        { discriminator: new Uint8Array([4, 5, 6, 7, 8, 9, 10, 11]), matchMode: "exact" },
    ],
    customValidator: async (ctx) => {
        // Additional validation
        return true;
    },
    required?: boolean,
});
```

## Simulation Validation

Enable RPC-based validation for runtime constraints:

```typescript
import { createSolanaRpc } from "@solana/kit";

const validator = createTransactionValidator({
    global: { signerRole: SignerRole.Any },
    programs: [
        /* ... */
    ],
    simulation: {
        rpc: createSolanaRpc("https://api.mainnet-beta.solana.com"),
        constraints: {
            requireSuccess: true, // Simulation must succeed
            maxComputeUnits: 200_000, // Max CU consumption
            forbidSignerAccountClosure: true, // Prevent signer drain attacks
        },
    },
});
```

**Note:** Simulation requires `transactionMessage` (base64-encoded wire transaction) in the context.

## Address Lookup Tables

Control v0 transaction lookup table usage (defaults to deny all for security):

```typescript
const validator = createTransactionValidator({
    global: {
        signerRole: SignerRole.Any,

        // Option 1: Deny all lookup tables (default if omitted)
        addressLookupTables: false,

        // Option 2: Allow any lookup tables (opt-out of validation)
        addressLookupTables: true,

        // Option 3: Allow specific tables with constraints (recommended)
        addressLookupTables: {
            allowedTables: [address("4QwSwNriKPrz8DLW4ju5uxC2TN5cksJx6tPUPj7DGLAW")],
            maxTables: 2,
            maxIndexedAccounts: 32,
        },
    },
    programs: [
        /* ... */
    ],
});
```

**Security Note:** This validates lookup table addresses and structure. To validate the actual resolved addresses inside tables, use simulation (which requires RPC).

### Recommended Guardrails

Combine the new declarative knobs with structural limits and simulation to keep untrusted transactions predictable:

```typescript
const validator = createTransactionValidator({
    global: {
        signerRole: SignerRole.FeePayerOnly,
        minInstructions: 1,
        maxInstructions: 8,
        maxAccounts: 64,
        addressLookupTables: false, // Deny lookup tables for maximum security
    },
    programs: [
        createSystemProgramValidator({
            instructions: {
                [SystemInstruction.WithdrawNonceAccount]: {
                    maxLamports: 500_000_000n,
                    allowedRecipients: [TREASURY],
                    allowedNonceAccounts: [OPERATIONS_NONCE],
                    allowedAuthorities: [TREASURY],
                },
                [SystemInstruction.AuthorizeNonceAccount]: {
                    allowedNonceAccounts: [OPERATIONS_NONCE],
                    allowedCurrentAuthorities: [TREASURY],
                    allowedNewAuthorities: [TREASURY_ROTATION_BUFFER],
                },
            },
        }),
        createSplTokenValidator({
            instructions: {
                [TokenInstruction.CloseAccount]: {
                    allowedAccounts: [USER_VAULT],
                    allowedDestinations: [TREASURY],
                    allowedOwners: [SIGNER],
                },
                [TokenInstruction.FreezeAccount]: {
                    allowedAccounts: [USER_VAULT],
                    allowedMints: [APP_TOKEN_MINT],
                    allowedAuthorities: [FREEZE_AUTHORITY],
                },
            },
        }),
        createComputeBudgetValidator({
            instructions: {
                [ComputeBudgetInstruction.SetComputeUnitLimit]: { maxUnits: 1_000_000 },
                [ComputeBudgetInstruction.SetLoadedAccountsDataSizeLimit]: { maxBytes: 65_536 },
            },
        }),
    ],
    simulation: {
        rpc,
        constraints: {
            requireSuccess: true,
            forbidSignerAccountClosure: true,
            maxComputeUnits: 200_000,
        },
    },
});
```

These defaults keep transactions bounded (≤8 instructions / 64 accounts) while ensuring nonce withdrawals, token closes, and compute-budget inflation cannot bypass the allowlists you define.

## Error Handling

All validation failures throw `ValidationError`:

```typescript
import { ValidationError } from "solana-tx-validator";

try {
    await validator(transaction, context);
} catch (error) {
    if (error instanceof ValidationError) {
        console.error(error.message);
        // "System Program: TransferSol amount 2000000000 exceeds limit 1000000000"
        // "Instruction 0 uses unauthorized program TokenkegQfe..."
        // "Signer must be the fee payer"
    }
}
```

## TypeScript

The package exports all types for building custom validators:

```typescript
import type {
    PolicyResult,
    GlobalPolicyContext,
    InstructionPolicyContext,
    CustomValidationCallback,
    InstructionPolicy,
    ProgramPolicy,
} from "solana-tx-validator";
```

## License

MIT
