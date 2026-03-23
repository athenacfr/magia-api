import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    vite: "src/vite.ts",
    cli: "src/cli.ts",
    test: "src/test.ts",
    codegen: "src/codegen.ts",
    rollup: "src/rollup.ts",
    webpack: "src/webpack.ts",
    esbuild: "src/esbuild.ts",
  },
  format: "esm",
  dts: true,
  clean: true,
  sourcemap: true,
});
