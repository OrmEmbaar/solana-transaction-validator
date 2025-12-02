# solana-tx-validator

Declarative transaction validation for Solana remote signers. Validate untrusted transactions before signing with a type-safe, composable policy engine built for `@solana/kit`.

**Secure by default:** Programs and instructions are denied unless explicitly allowed. Define exactly what your keys can sign.

## Installation

```bash
npm install solana-tx-validator
# or
pnpm add solana-tx-validator
```

Requires `@solana/kit` as a peer dependency.

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
    ValidationError,
} from "solana-tx-validator";

const TREASURY = address("Treasury111111111111111111111111111111111");

// Create a validator with your policies
const validator = createTransactionValidator({
    global: {
        signerRole: SignerRole.FeePayerOnly,
        maxInstructions: 10,
    },
    programs: [
        createSystemProgramValidator({
            instructions: {
                [SystemInstruction.TransferSol]: {
                    maxLamports: 1_000_000_000n, // 1 SOL
                    allowedDestinations: [TREASURY],
                },
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

// Validate before signing
try {
    await validator(compiledTransaction, {
        signer: address("YourSignerPublicKey111111111111111111111"),
    });
    // Safe to sign
} catch (error) {
    if (error instanceof ValidationError) {
        console.error("Rejected:", error.message);
    }
}
```

## Core Concepts

### Global Policy

Every validator requires a global policy that applies to all transactions:

```typescript
global: {
    signerRole: SignerRole.FeePayerOnly,  // Required: FeePayerOnly | ParticipantOnly | Any
    minInstructions: 1,                    // Default: 1 (prevents empty transactions)
    maxInstructions: 10,
    maxSignatures: 3,
    maxAccounts: 64,
    allowedVersions: [0],                  // Default: [0] (v0 only)
    addressLookupTables: false,            // Default: false (deny all ALTs)
}
```

### Program Validators

Programs not in the `programs` array are **denied by default**. This strict allowlist ensures only explicitly permitted programs can be called.

```typescript
programs: [
    createSystemProgramValidator({
        instructions: {
            /* ... */
        },
    }),
    createSplTokenValidator({
        instructions: {
            /* ... */
        },
    }),
    // Any program not listed here will be rejected
];
```

### Instruction Configuration

Each instruction can be configured in five ways:

| Config                | Behavior                             |
| --------------------- | ------------------------------------ |
| `undefined` (omitted) | Denied (implicit)                    |
| `false`               | Denied (explicit, self-documenting)  |
| `true`                | Allowed with no constraints          |
| `{ ...config }`       | Allowed with declarative constraints |
| `(ctx) => ...`        | Allowed with custom validation       |

```typescript
instructions: {
    [SystemInstruction.TransferSol]: {
        maxLamports: 1_000_000_000n,
        allowedDestinations: [TREASURY],
    },
    [SystemInstruction.AdvanceNonceAccount]: true,
    [SystemInstruction.CreateAccount]: false,
    [SystemInstruction.Assign]: async (ctx) => {
        // Custom logic
        return someCondition ? true : "Denied: reason";
    },
    // Omitted instructions are denied
}
```

## Built-in Program Validators

### System Program

```typescript
import { createSystemProgramValidator, SystemInstruction } from "solana-tx-validator";

createSystemProgramValidator({
    instructions: {
        [SystemInstruction.TransferSol]: {
            maxLamports: 1_000_000_000n,
            allowedDestinations: [TREASURY],
        },
        [SystemInstruction.CreateAccount]: {
            maxLamports: 10_000_000n,
            maxSpace: 1000n,
            allowedOwnerPrograms: [TOKEN_PROGRAM],
        },
        [SystemInstruction.AdvanceNonceAccount]: {
            allowedNonceAccounts: [NONCE_ACCOUNT],
            allowedAuthorities: [AUTHORITY],
        },
    },
});
```

### SPL Token

```typescript
import { createSplTokenValidator, TokenInstruction } from "solana-tx-validator";

createSplTokenValidator({
    instructions: {
        [TokenInstruction.Transfer]: {
            maxAmount: 1_000_000n,
        },
        [TokenInstruction.TransferChecked]: {
            maxAmount: 1_000_000n,
            allowedMints: [USDC_MINT],
        },
        [TokenInstruction.Approve]: {
            maxAmount: 500_000n,
            allowedDelegates: [DELEGATE],
        },
        [TokenInstruction.CloseAccount]: {
            allowedAccounts: [USER_TOKEN_ACCOUNT],
            allowedDestinations: [TREASURY],
        },
    },
});
```

### Token-2022

Same API as SPL Token:

```typescript
import { createToken2022Validator, Token2022Instruction } from "solana-tx-validator";

createToken2022Validator({
    instructions: {
        [Token2022Instruction.TransferChecked]: {
            maxAmount: 1_000_000n,
            allowedMints: [TOKEN_2022_MINT],
        },
    },
});
```

### Compute Budget

```typescript
import { createComputeBudgetValidator, ComputeBudgetInstruction } from "solana-tx-validator";

createComputeBudgetValidator({
    instructions: {
        [ComputeBudgetInstruction.SetComputeUnitLimit]: {
            maxUnits: 1_400_000,
        },
        [ComputeBudgetInstruction.SetComputeUnitPrice]: {
            maxMicroLamportsPerCu: 100_000n,
        },
        [ComputeBudgetInstruction.RequestHeapFrame]: {
            maxBytes: 256 * 1024,
        },
        [ComputeBudgetInstruction.SetLoadedAccountsDataSizeLimit]: {
            maxBytes: 65_536,
        },
    },
});
```

### Memo

```typescript
import { createMemoValidator, MemoInstruction } from "solana-tx-validator";

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

For programs without official `@solana-program/*` packages, use discriminator-based allowlisting:

```typescript
import { createCustomProgramValidator, address } from "solana-tx-validator";

// Example: Allow specific instructions from your custom program
const myProgramValidator = createCustomProgramValidator({
    programAddress: address("MyProgram111111111111111111111111111111111"),
    allowedInstructions: [
        // Anchor 8-byte discriminator (prefix match)
        {
            discriminator: new Uint8Array([0x9a, 0x5c, 0x1b, 0x3d, 0x8f, 0x2e, 0x7a, 0x4c]),
            matchMode: "prefix",
        },
        // Native 1-byte discriminator (exact match on full instruction data)
        {
            discriminator: new Uint8Array([2, 0, 0, 0 /* ... rest of expected data */]),
            matchMode: "exact",
        },
    ],
    // Optional: Additional validation after discriminator check
    customValidator: async (ctx) => {
        const data = ctx.instruction.data;
        // Parse and validate instruction data
        return true;
    },
});
```

**Match modes:**

- `prefix`: Instruction data must start with the discriminator bytes
- `exact`: Instruction data must exactly match the discriminator bytes

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
            maxComputeUnits: 200_000, // Cap CU consumption
            forbidSignerAccountClosure: true, // Prevent signer drain attacks
        },
    },
});
```

Simulation requires `transactionMessage` (base64-encoded wire transaction) in the context:

```typescript
await validator(compiledTransaction, {
    signer: address("..."),
    transactionMessage: base64EncodedTransaction,
});
```

## Required Programs

Mark programs or specific instructions as required:

```typescript
programs: [
    createComputeBudgetValidator({
        instructions: {
            /* ... */
        },
        required: true, // Program must be present
    }),
    createSystemProgramValidator({
        instructions: {
            /* ... */
        },
        required: [SystemInstruction.TransferSol], // Specific instruction required
    }),
];
```

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

All types are exported for building custom validators:

```typescript
import type {
    ValidationResult,
    GlobalValidationContext,
    InstructionValidationContext,
    CustomValidationCallback,
    ProgramValidator,
    GlobalPolicyConfig,
    SimulationConstraints,
} from "solana-tx-validator";
```

## License

MIT
