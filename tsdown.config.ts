import { defineConfig } from "tsdown";

export default defineConfig({
    entry: ["./src/match.ts", "./src/parse.ts"],
    outDir: "./dist",
    platform: "neutral",
    dts: true,
    format: ["cjs", "esm"],
    sourcemap: true,
    skipNodeModulesBundle: true,
    exports: true,
});
