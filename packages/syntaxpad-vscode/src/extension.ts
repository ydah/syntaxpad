import * as vscode from "vscode";

import { SyntaxPadPanel } from "./panel.js";

export const activate = (context: vscode.ExtensionContext): void => {
  context.subscriptions.push(
    vscode.commands.registerCommand("syntaxpad.openView", async () => {
      await SyntaxPadPanel.show(context.extensionUri);
    }),
  );
};
