import sharedConfig from "@solana-signer/test-config";
import { mergeConfig, defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
    sharedConfig,
    defineConfig({
        test: {
            alias: {
                "@solana-signer/shared": resolve(__dirname, "../shared/src/index.ts"),
            },
        },
    }),
);
