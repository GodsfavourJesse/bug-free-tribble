import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/server.ts"],

    format: ["esm"],

    target: "es2022",

    outDir: "dist",

    clean: true,

    sourcemap: true,

    splitting: false,

    dts: false,

    minify: false,
});