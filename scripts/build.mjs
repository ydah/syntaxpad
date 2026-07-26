import { build } from "esbuild";
import { copyFile } from "node:fs/promises";

await Promise.all([
  build({
    bundle: true,
    entryPoints: ["packages/syntaxpad-vscode/src/extension.ts"],
    external: ["vscode"],
    format: "cjs",
    outfile: "packages/syntaxpad-vscode/dist/extension.cjs",
    platform: "node",
    sourcemap: true,
    target: "node20",
  }),
  build({
    bundle: true,
    entryPoints: ["packages/syntaxpad-lsp/src/server.ts"],
    format: "cjs",
    outfile: "packages/syntaxpad-vscode/dist/server.cjs",
    platform: "node",
    sourcemap: true,
    target: "node20",
  }),
  build({
    bundle: true,
    entryPoints: ["packages/syntaxpad-vscode/src/webview/main.ts"],
    format: "iife",
    outfile: "packages/syntaxpad-vscode/dist/webview.js",
    platform: "browser",
    sourcemap: true,
    target: "es2022",
  }),
  copyFile(
    "packages/syntaxpad-vscode/src/webview/styles.css",
    "packages/syntaxpad-vscode/dist/webview.css",
  ),
]);
