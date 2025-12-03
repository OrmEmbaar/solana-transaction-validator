#!/bin/bash

# Start Solana test validator with optimized settings for integration tests
# Uses flock to ensure only one instance runs at a time

set -e

LOCKFILE="/tmp/solana-test-validator.lock"
LEDGER_DIR="test-ledger"

# Use flock to ensure only one instance runs
exec 200>"$LOCKFILE"
if ! flock -n 200; then
    echo "Test validator is already running (lockfile exists)"
    exit 0
fi

# Clean up any leftover ledger from previous runs
if [ -d "$LEDGER_DIR" ]; then
    echo "Removing old test ledger..."
    rm -rf "$LEDGER_DIR"
fi

# Cleanup function to remove ledger on exit
cleanup() {
    echo "Stopping validator and cleaning up..."
    rm -rf "$LEDGER_DIR"
    rm -f "$LOCKFILE"
}

# Trap cleanup on exit and interrupts
trap cleanup EXIT INT TERM

echo "Starting Solana test validator..."
echo "RPC endpoint: http://localhost:8899"
echo "WebSocket endpoint: ws://localhost:8900"
echo ""
echo "Press Ctrl+C to stop the validator"
echo ""

# Start validator with optimized settings
solana-test-validator \
    --ledger "$LEDGER_DIR" \
    --rpc-port 8899 \
    --bind-address 0.0.0.0 \
    --faucet-port 9900 \
    --slots-per-epoch 32 \
    --quiet \
    --reset

