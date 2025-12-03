# Integration Tests

Comprehensive end-to-end tests validating the transaction validator against real Solana transaction scenarios.

## Test Files

### `malicious-transactions.test.ts` (31 tests)
Tests that malicious transactions are properly rejected:
- **Unauthorized Program Attacks** - Unknown/fake programs, BPF loaders
- **Dangerous Instructions** - System Program and SPL Token attack vectors
- **Empty Transactions** - Zero instructions, compute-budget-only
- **Compute Budget Manipulation** - Excessive CUs, priority fees, heap frames
- **Signer Role Violations** - FeePayerOnly, ParticipantOnly enforcement
- **Custom Discriminators** - Unknown/wrong instruction discriminators

### `valid-transactions.test.ts` (17 tests)
Tests that legitimate transactions pass validation:
- **System Program** - Transfers, account creation, allocation within limits
- **SPL Token** - Transfers, approvals, burns with proper constraints
- **Compute Budget** - Standard priority fee configurations
- **Multi-instruction** - Complex transactions with multiple programs
- **Signer Roles** - Compliant fee payer and participant scenarios
- **Custom Programs** - Allowed discriminator patterns

### `simulation-attacks.test.ts` (6 tests)
Tests RPC simulation validation with funded accounts:
- **Failed Simulations** - Invalid account access
- **Compute Overruns** - Exceeding maxComputeUnits
- **Account Closure** - Signer account drainage detection
- **Successful Validation** - Proper transactions that simulate correctly

**Note:** Simulation tests automatically create and airdrop funds to test accounts.

## Running Tests

### Without Validator (Policy Logic Only)
```bash
pnpm test:integration
```
Tests run but simulation tests skip gracefully.

### With Validator (Full Test Suite)

1. Start validator in one terminal:
```bash
./scripts/start-test-validator.sh
```

2. Run tests in another terminal:
```bash
pnpm test:integration
```

All 54 tests will execute, including simulation tests that require RPC.

## Test Results

```
✓ malicious-transactions.test.ts (31 tests)
✓ valid-transactions.test.ts (17 tests)
✓ simulation-attacks.test.ts (6 tests)
```

**Total: 54 integration tests**

## Adding New Tests

Follow the inline pattern from existing tests:

```typescript
it("should reject malicious instruction", async () => {
    const blockhash = await getRecentBlockhash();
    const validator = createTransactionValidator({
        global: { signerRole: SignerRole.Any },
        programs: [/* ... */],
    });

    const ix = getSomeInstruction({
        source: createNoopSigner(SIGNER_ADDRESS),
        // ... params
    });

    const tx = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
        (tx) => appendTransactionMessageInstruction(ix, tx),
        (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
        compileTransactionMessage,
    );

    await expectValidationError(validator, tx, SIGNER_ADDRESS, "expected error");
});
```

**Key Points:**
- Use inline transaction building (don't abstract into helpers)
- Use `createNoopSigner()` for accounts that need signer types
- Use `expectValidationError()` for rejection tests
- Use standard `expect(...).resolves.not.toThrow()` for success tests
- Don't number describe blocks - use descriptive names

