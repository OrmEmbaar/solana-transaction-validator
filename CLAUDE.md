# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Declarative policy engine for validating Solana transactions before signing. Built on `@solana/kit` with a secure-by-default allowlist approach — any program/instruction not explicitly allowed is denied.

Package name: `solana-transaction-validator`. Peer dependency: `@solana/kit` ^6.5.0.

## Commands

```bash
pnpm install              # Install dependencies
pnpm build                # Production build (ESM + CJS via tsup)
pnpm dev                  # Build in watch mode
pnpm test                 # Unit tests only (src/**/*.test.ts)
pnpm test:integration     # Integration tests only (test/**/*.test.ts)
pnpm test:all             # Unit + integration tests
pnpm test:watch           # Unit tests in watch mode
pnpm check-types          # TypeScript type checking
pnpm lint                 # ESLint (zero warnings enforced: --max-warnings 0)
pnpm format               # Prettier auto-fix
pnpm format:check         # Prettier check only
```

Run a single test file: `pnpm vitest run path/to/file.test.ts`

## Architecture

### Validation Flow

```
createTransactionValidator(config) → validator(transactionInput, signerAddress)
  1. Decode input (base64 string | bytes | Transaction object)
  2. Build ValidationContext (signer, transaction, compiled/decompiled messages)
  3. Validate global policies (signer role, instruction limits, versions, ALTs)
  4. Validate required programs are present
  5. Validate each instruction against its program's ProgramValidator
  6. Reject any instruction from a program not in the allowlist
```

### Module Layout

- **`src/engine.ts`** — Core orchestrator. `createTransactionValidator()` returns a reusable async validator function that throws `ValidationError` on failure.
- **`src/types.ts`** — All shared types: `ValidationContext`, `ValidationResult`, `InstructionCallback<T>`, `ProgramValidator`, `GlobalPolicyConfig`, `SignerRole` enum.
- **`src/errors.ts`** — `ValidationError` class with optional `details` field.
- **`src/global/`** — Global transaction policies: signer role, instruction count limits, transaction version, address lookup tables.
- **`src/programs/`** — Per-program validators, each created via a factory function (`createSystemProgramValidator`, `createSplTokenValidator`, etc.). `createCustomProgramValidator` handles unknown programs using byte-prefix discriminator matching.

### Instruction Config Pattern (5 levels)

Every instruction in a program validator config uses `InstructionConfigEntry<TConfig, TParsed>`:
1. `undefined` — implicit deny (secure default)
2. `false` — explicit deny (self-documenting)
3. `true` — allow unrestricted
4. `{ ...config }` — allow with declarative constraints (e.g., `maxAmount`, `allowedDestinations`)
5. `(ctx, instruction) => ValidationResult` — fully typed callback for custom logic

### Exports

Three entry points: root (`solana-transaction-validator`), `/global`, `/programs`. A `/simulation` entry is declared in package.json but has no source file yet.

## Code Style

- Prettier: 4-space indent, 100 char width, trailing commas, arrow parens always
- ESLint: flat config (v9), zero warnings policy
- Unused variables must be prefixed with `_`

## Testing Conventions

- **Unit tests** (`src/__tests__/`, `src/programs/__tests__/`): mocked validators, fast, no network
- **Integration tests** (`test/integration/`): real transaction building with `@solana/kit`, policy-based (no running validator needed)
- Shared test helpers in `test/fixtures/test-helpers.ts`
- Inline transaction building preferred over abstractions — `@solana/kit`'s type system works best with `pipe()` and type inference
