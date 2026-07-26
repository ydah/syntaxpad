import { rm } from "node:fs/promises";
import { glob } from "node:fs/promises";

const paths = ["dist", "coverage", "syntaxpad.vsix"];

for await (const path of glob("packages/*/dist")) {
  paths.push(path);
}

await Promise.all(paths.map((path) => rm(path, { force: true, recursive: true })));
