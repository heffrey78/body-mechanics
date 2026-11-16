/**
 * Body Mechanics' engine (D2, #16): the app's logic, with no Node or browser imports. Its host (the
 * Tauri webview on desktop and Android) gives it files, git and secrets through ports.
 */
export const ENGINE_VERSION = "0.1.0";
export * from "./records/index.ts";
export * from "./ports/index.ts";
export * from "./vault/index.ts";
export * from "./catalogue/index.ts";
export * from "./store/mod.ts";
export * from "./search/index.ts";
export * from "./suggest/index.ts";
