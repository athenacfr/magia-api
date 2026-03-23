// Public codegen API for non-Vite usage (custom build scripts, Webpack, etc.)
export { generate } from "./codegen/index";
export type { GenerateOptions, GenerateResult } from "./codegen/index";
export { resolveConfig, loadConfig, findConfigFile } from "./loader";
