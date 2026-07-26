import { getFoldingRanges, parseGrammar, type Dialect } from "@syntaxpad/core";
import { LanguageClient, TransportKind } from "vscode-languageclient/node";
import type { LanguageClientOptions, ServerOptions } from "vscode-languageclient/node";
import * as vscode from "vscode";

import { registerRefactoringCommands } from "./commands.js";
import { registerConflictAnalysis } from "./external-tools.js";
import { SyntaxPadPanel } from "./panel.js";

let languageClient: LanguageClient | undefined;
const automaticallyFolded = new Set<string>();

const grammarDialect = (document: vscode.TextDocument): Dialect => {
  const value = vscode.workspace
    .getConfiguration("syntaxpad", document.uri)
    .get<string>("dialect", "bison");
  return value === "yacc" || value === "lrama" ? value : "bison";
};

const isGrammarEditor = (editor: vscode.TextEditor | undefined): editor is vscode.TextEditor =>
  editor !== undefined &&
  (editor.document.languageId === "yacc" ||
    editor.document.fileName.endsWith(".y") ||
    editor.document.fileName.endsWith(".yy"));

const foldActions = async (
  editor: vscode.TextEditor | undefined,
  automatic: boolean,
): Promise<void> => {
  if (!isGrammarEditor(editor)) {
    return;
  }
  const key = editor.document.uri.toString();
  const enabled = vscode.workspace
    .getConfiguration("syntaxpad", editor.document.uri)
    .get<boolean>("foldActionsByDefault", true);
  if (automatic && (!enabled || automaticallyFolded.has(key))) {
    return;
  }
  const parsed = parseGrammar(editor.document.getText(), {
    dialect: grammarDialect(editor.document),
  });
  const selectionLines = [
    ...new Set(
      getFoldingRanges(parsed)
        .filter((range) => range.kind === "action")
        .map((range) => editor.document.positionAt(range.start).line),
    ),
  ];
  if (selectionLines.length === 0) {
    return;
  }
  automaticallyFolded.add(key);
  await vscode.commands.executeCommand("editor.fold", { selectionLines });
};

export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
  registerRefactoringCommands(context);
  registerConflictAnalysis(context);
  context.subscriptions.push(
    vscode.commands.registerCommand("syntaxpad.openView", async () => {
      await SyntaxPadPanel.show(context.extensionUri);
    }),
    vscode.commands.registerCommand("syntaxpad.foldActions", async () => {
      await foldActions(vscode.window.activeTextEditor, false);
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      void foldActions(editor, true);
    }),
  );

  const serverModule = context.asAbsolutePath("dist/server.cjs");
  const serverOptions: ServerOptions = {
    debug: { module: serverModule, transport: TransportKind.ipc },
    run: { module: serverModule, transport: TransportKind.ipc },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { language: "yacc", scheme: "file" },
      { language: "yacc", scheme: "untitled" },
    ],
    synchronize: { configurationSection: "syntaxpad" },
  };
  languageClient = new LanguageClient(
    "syntaxpad",
    "SyntaxPad Language Server",
    serverOptions,
    clientOptions,
  );
  context.subscriptions.push(languageClient);
  await languageClient.start();
  await foldActions(vscode.window.activeTextEditor, true);
};

export const deactivate = async (): Promise<void> => {
  await languageClient?.stop();
};
