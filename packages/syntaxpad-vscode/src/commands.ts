import {
  addAlternative,
  extractRule,
  findRuleAtOffset,
  inlineRule,
  parseGrammar,
  reorderAlternatives,
  wrapSelection,
  type Dialect,
  type GrammarDocument,
  type NewRulePlacement,
  type SourceRange,
  type TransformPlan,
  type TransformResult,
  type WrapKind,
} from "@syntaxpad/core";
import { z } from "zod";
import { performance } from "node:perf_hooks";
import * as vscode from "vscode";

export type MetricRecorder = (kind: "workspace-edit", durationMs: number) => void;

let recordMetric: MetricRecorder | undefined;

const rangeArgumentSchema = z.strictObject({
  end: z.number().int().nonnegative(),
  start: z.number().int().nonnegative(),
  uri: z.string(),
});

const ruleArgumentSchema = z.strictObject({
  ruleName: z.string(),
  uri: z.string().optional(),
});

const reorderArgumentSchema = z.strictObject({
  from: z.number().int().nonnegative(),
  ruleId: z.string(),
  to: z.number().int().nonnegative(),
  uri: z.string(),
});

const dialectFor = (document: vscode.TextDocument): Dialect => {
  const value = vscode.workspace
    .getConfiguration("syntaxpad", document.uri)
    .get<string>("dialect", "bison");
  return value === "yacc" || value === "lrama" ? value : "bison";
};

const newRulePlacementFor = (document: vscode.TextDocument): NewRulePlacement =>
  vscode.workspace
    .getConfiguration("syntaxpad", document.uri)
    .get<string>("newRulePlacement", "afterSource") === "sectionEnd"
    ? "sectionEnd"
    : "afterSource";

const editorFor = async (uri?: string): Promise<vscode.TextEditor | undefined> => {
  const active = vscode.window.activeTextEditor;
  if (uri === undefined || active?.document.uri.toString() === uri) {
    return active;
  }
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
  return vscode.window.showTextDocument(document, { preview: false });
};

const parseEditor = (editor: vscode.TextEditor): GrammarDocument =>
  parseGrammar(editor.document.getText(), { dialect: dialectFor(editor.document) });

const activeSelection = (editor: vscode.TextEditor, input: unknown): SourceRange => {
  const parsed = rangeArgumentSchema.safeParse(input);
  return parsed.success
    ? { end: parsed.data.end, start: parsed.data.start }
    : {
        end: editor.document.offsetAt(editor.selection.end),
        start: editor.document.offsetAt(editor.selection.start),
      };
};

const promptRuleName = async (title: string): Promise<string | undefined> =>
  vscode.window.showInputBox({
    prompt: title,
    validateInput: (value) =>
      /^[A-Za-z_.][A-Za-z0-9_.-]*$/u.test(value) ? undefined : "Use a valid grammar symbol name.",
  });

const applyPlan = async (
  editor: vscode.TextEditor,
  expectedVersion: number,
  result: TransformResult,
): Promise<boolean> => {
  const startedAt = performance.now();
  if (!result.ok) {
    await vscode.window.showErrorMessage(result.error.message);
    return false;
  }
  if (editor.document.version !== expectedVersion) {
    await vscode.window.showErrorMessage(
      "The document changed while the refactoring was being prepared. Try again.",
    );
    return false;
  }

  const edit = new vscode.WorkspaceEdit();
  result.plan.patches.forEach((patch) => {
    edit.replace(
      editor.document.uri,
      new vscode.Range(
        editor.document.positionAt(patch.range.start),
        editor.document.positionAt(patch.range.end),
      ),
      patch.text,
    );
  });
  const applied = await vscode.workspace.applyEdit(edit);
  recordMetric?.("workspace-edit", performance.now() - startedAt);
  if (!applied) {
    await vscode.window.showErrorMessage("VS Code rejected the grammar edit.");
    return false;
  }
  await offerConflictCheck(result.plan);
  return true;
};

const offerConflictCheck = async (plan: TransformPlan): Promise<void> => {
  if (!plan.conflictCheckRecommended) {
    return;
  }
  const selection = await vscode.window.showInformationMessage(
    "The grammar structure changed. Recheck parser conflicts.",
    "Run Conflict Analysis",
  );
  if (selection === "Run Conflict Analysis") {
    await vscode.commands.executeCommand("syntaxpad.runConflicts");
  }
};

const requireEditor = async (uri?: string): Promise<vscode.TextEditor | undefined> => {
  const editor = await editorFor(uri);
  if (editor === undefined) {
    await vscode.window.showErrorMessage("Open a grammar editor first.");
  }
  return editor;
};

const extractCommand = async (input: unknown): Promise<void> => {
  const argument = rangeArgumentSchema.safeParse(input);
  const editor = await requireEditor(argument.success ? argument.data.uri : undefined);
  if (editor === undefined) {
    return;
  }
  const version = editor.document.version;
  const name = await promptRuleName("Name for the extracted rule");
  if (name === undefined) {
    return;
  }
  await applyPlan(
    editor,
    version,
    extractRule(parseEditor(editor), activeSelection(editor, input), name, {
      placement: newRulePlacementFor(editor.document),
    }),
  );
};

const wrapCommand = async (input: unknown, kind: WrapKind): Promise<void> => {
  const argument = rangeArgumentSchema.safeParse(input);
  const editor = await requireEditor(argument.success ? argument.data.uri : undefined);
  if (editor === undefined) {
    return;
  }
  const version = editor.document.version;
  const document = parseEditor(editor);
  const selection = activeSelection(editor, input);
  const options = { placement: newRulePlacementFor(editor.document) };
  let result = wrapSelection(document, selection, kind, undefined, options);
  if (!result.ok && result.error.code === "helper-name-required") {
    const helperName = await promptRuleName(`Name for the generated ${kind} rule`);
    if (helperName === undefined) {
      return;
    }
    result = wrapSelection(document, selection, kind, helperName, options);
  }
  await applyPlan(editor, version, result);
};

const inlineCommand = async (input: unknown): Promise<void> => {
  const argument = ruleArgumentSchema.safeParse(input);
  const editor = await requireEditor(argument.success ? argument.data.uri : undefined);
  if (editor === undefined) {
    return;
  }
  const version = editor.document.version;
  const document = parseEditor(editor);
  const cursorOffset = editor.document.offsetAt(editor.selection.active);
  const ruleName =
    (argument.success ? argument.data.ruleName : undefined) ??
    findRuleAtOffset(document, cursorOffset)?.name;
  if (ruleName === undefined) {
    await vscode.window.showErrorMessage("Place the cursor in a rule to inline it.");
    return;
  }

  let result = inlineRule(document, ruleName);
  if (!result.ok && result.error.code === "inline-action-confirmation-required") {
    const confirmation = await vscode.window.showWarningMessage(
      result.error.message,
      { modal: true },
      "Inline and Preserve Action",
    );
    if (confirmation !== "Inline and Preserve Action") {
      return;
    }
    result = inlineRule(document, ruleName, { confirmAction: true });
  }
  await applyPlan(editor, version, result);
};

const addAlternativeCommand = async (input: unknown): Promise<void> => {
  const argument = ruleArgumentSchema.safeParse(input);
  const editor = await requireEditor(argument.success ? argument.data.uri : undefined);
  if (editor === undefined) {
    return;
  }
  const document = parseEditor(editor);
  const ruleName =
    (argument.success ? argument.data.ruleName : undefined) ??
    findRuleAtOffset(document, editor.document.offsetAt(editor.selection.active))?.name;
  if (ruleName === undefined) {
    await vscode.window.showErrorMessage("Place the cursor in a rule first.");
    return;
  }
  await applyPlan(editor, editor.document.version, addAlternative(document, ruleName));
};

const reorderCommand = async (input: unknown): Promise<void> => {
  const argument = reorderArgumentSchema.safeParse(input);
  if (!argument.success) {
    await vscode.window.showErrorMessage("The alternative reorder request was invalid.");
    return;
  }
  const editor = await requireEditor(argument.data.uri);
  if (editor === undefined) {
    return;
  }
  const document = parseEditor(editor);
  const rule = document.rules.find((candidate) => candidate.id === argument.data.ruleId);
  if (rule === undefined) {
    await vscode.window.showErrorMessage("The selected rule changed before it could be reordered.");
    return;
  }
  await applyPlan(
    editor,
    editor.document.version,
    reorderAlternatives(document, rule.name, argument.data.from, argument.data.to),
  );
};

export const registerRefactoringCommands = (
  context: vscode.ExtensionContext,
  metrics?: MetricRecorder,
): void => {
  recordMetric = metrics;
  context.subscriptions.push(
    vscode.commands.registerCommand("syntaxpad.extractRule", extractCommand),
    vscode.commands.registerCommand("syntaxpad.inlineRule", inlineCommand),
    vscode.commands.registerCommand("syntaxpad.wrapOption", (input: unknown) =>
      wrapCommand(input, "option"),
    ),
    vscode.commands.registerCommand("syntaxpad.wrapList", (input: unknown) =>
      wrapCommand(input, "list"),
    ),
    vscode.commands.registerCommand("syntaxpad.addAlternative", addAlternativeCommand),
    vscode.commands.registerCommand("syntaxpad.reorderAlternatives", reorderCommand),
  );
};
