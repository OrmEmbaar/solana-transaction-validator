import sharedConfig from "@solana-signer/test-config";
import { mergeConfig, defineConfig } from "vitest/config";

export default mergeConfig(
    sharedConfig,
    defineConfig({
        test: {
            // Package specific overrides
        },
    }),
);
