import { spawn } from "node:child_process";
import { stdout } from "node:process";
import { fileURLToPath, URL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const extensionDirectory = fileURLToPath(new URL("../packages/syntaxpad-vscode/", import.meta.url));
const executable = fileURLToPath(new URL("../node_modules/@vscode/vsce/vsce", import.meta.url));
const output = fileURLToPath(new URL("../syntaxpad.vsix", import.meta.url));

const child = spawn(
  executable,
  ["package", "--allow-missing-repository", "--no-dependencies", "--out", output],
  {
    cwd: extensionDirectory,
    shell: false,
    stdio: "inherit",
  },
);

const result = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("close", (code, signal) => {
    resolve({ code, signal });
  });
});

if (result.code !== 0) {
  throw new Error(
    result.signal === null
      ? `Extension packaging exited with code ${String(result.code)}.`
      : `Extension packaging was stopped by ${result.signal}.`,
  );
}

stdout.write(`Created ${output.replace(`${repositoryRoot}/`, "")}\n`);
