import { defineConfig } from "tsup";

export default defineConfig({
    entry: [
        "src/server.ts",
        "src/workers/worker.ts",
        "scripts/image-analysis-worker.ts",
    ],

    format: ["esm"],

    target: "es2022",

    outDir: "dist",

    clean: true,

    sourcemap: true,

    splitting: false,

    dts: false,

    minify: false,

});
