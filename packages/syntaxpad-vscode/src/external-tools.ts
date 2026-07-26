import { parseGrammar } from "@syntaxpad/core";
import {
  describeConflictInvocations,
  runConflictAnalysis,
  type ConflictReport,
  type ToolInvocation,
} from "@syntaxpad/tools";
import { createHash } from "node:crypto";
import { z } from "zod";
import * as vscode from "vscode";

import { parseConflictCommandTarget } from "./conflict-command.js";
import { SyntaxPadPanel } from "./panel.js";

const toolConfigurationSchema = z.strictObject({
  additionalArguments: z
    .array(
      z
        .string()
        .max(4_096)
        .refine((value) => !value.includes("\0"), "Arguments cannot contain NUL bytes."),
    )
    .max(100),
  executable: z
    .string()
    .max(4_096)
    .refine((value) => !value.includes("\0"), "Executable paths cannot contain NUL bytes."),
  maxOutputKiB: z.number().int().min(64).max(16_384),
  timeoutMs: z.number().int().min(500).max(120_000),
  tool: z.enum(["bison", "lrama"]),
});

type ToolConfiguration = z.infer<typeof toolConfigurationSchema>;

const isGrammarDocument = (
  document: vscode.TextDocument | undefined,
): document is vscode.TextDocument =>
  document !== undefined &&
  (document.languageId === "yacc" ||
    document.fileName.endsWith(".y") ||
    document.fileName.endsWith(".yy"));

const readConfiguration = (
  document: vscode.TextDocument,
): ToolConfiguration | z.ZodError<ToolConfiguration> => {
  const configuration = vscode.workspace.getConfiguration("syntaxpad", document.uri);
  const toolValue = configuration.get<string>("tool.kind", "bison");
  const executableValue = configuration.get<string>("tool.executable", "").trim();
  const parsed = toolConfigurationSchema.safeParse({
    additionalArguments: configuration.get<unknown>("tool.arguments", []),
    executable: executableValue.length === 0 ? toolValue : executableValue,
    maxOutputKiB: configuration.get<unknown>("tool.maxOutputKiB", 1_024),
    timeoutMs: configuration.get<unknown>("tool.timeoutMs", 10_000),
    tool: toolValue,
  });
  return parsed.success ? parsed.data : parsed.error;
};

const quoteArgument = (argument: string): string => JSON.stringify(argument);

const displayInvocation = (invocation: ToolInvocation): string =>
  [invocation.executable, ...invocation.args].map(quoteArgument).join(" ");

const confirmationKey = (configuration: ToolConfiguration): string =>
  `syntaxpad.confirmedTool.${createHash("sha256")
    .update(JSON.stringify(configuration))
    .digest("hex")}`;

const confirmInvocation = async (
  context: vscode.ExtensionContext,
  configuration: ToolConfiguration,
): Promise<boolean> => {
  const key = confirmationKey(configuration);
  if (context.globalState.get<boolean>(key) === true) {
    return true;
  }
  const invocations = describeConflictInvocations({
    additionalArguments: configuration.additionalArguments,
    executable: configuration.executable,
    tool: configuration.tool,
  });
  const detail = invocations
    .map((invocation, index) => {
      const label =
        index === 0
          ? "Primary command"
          : index === 1 && configuration.tool === "bison"
            ? "Compatible XML fallback"
            : "Text fallback if XML is unavailable";
      return `${label}:\n${displayInvocation(invocation)}`;
    })
    .join("\n\n");
  const choice = await vscode.window.showWarningMessage(
    `SyntaxPad will run ${configuration.tool} for conflict analysis. No shell is used and generated files stay in a temporary directory.`,
    { detail, modal: true },
    "Run",
  );
  if (choice !== "Run") {
    return false;
  }
  await context.globalState.update(key, true);
  return true;
};

const rangeFor = (document: vscode.TextDocument, start: number, end: number): vscode.Range =>
  new vscode.Range(document.positionAt(start), document.positionAt(end));

const conflictDiagnostics = (
  document: vscode.TextDocument,
  report: ConflictReport,
): readonly vscode.Diagnostic[] => {
  if (report.detail === "failed") {
    return [];
  }
  const grammar = parseGrammar(document.getText());
  const diagnostics: vscode.Diagnostic[] = [];
  report.conflicts.forEach((conflict) => {
    conflict.ruleNames.forEach((ruleName) => {
      grammar.rules
        .filter((rule) => rule.name === ruleName)
        .forEach((rule) => {
          const diagnostic = new vscode.Diagnostic(
            rangeFor(document, rule.nameRange.start, rule.nameRange.end),
            conflict.message,
            vscode.DiagnosticSeverity.Warning,
          );
          diagnostic.code = `parser-${conflict.kind}`;
          diagnostic.source = `SyntaxPad ${report.tool}`;
          diagnostics.push(diagnostic);
        });
    });
  });
  if (diagnostics.length === 0 && report.conflicts.length > 0) {
    const diagnostic = new vscode.Diagnostic(
      rangeFor(document, 0, 0),
      `${String(report.totals.shiftReduce)} shift/reduce and ${String(report.totals.reduceReduce)} reduce/reduce conflicts were reported, but locations could not be mapped.`,
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.code = "parser-conflicts-unmapped";
    diagnostic.source = `SyntaxPad ${report.tool}`;
    diagnostics.push(diagnostic);
  }
  return diagnostics;
};

const showReportResult = async (report: ConflictReport): Promise<void> => {
  const summary = `${String(report.totals.shiftReduce)} shift/reduce, ${String(report.totals.reduceReduce)} reduce/reduce`;
  if (report.detail === "failed") {
    await vscode.window.showErrorMessage(
      report.messages[0] ?? "Conflict analysis failed without a report.",
    );
    return;
  }
  if (report.detail === "counts-only") {
    await vscode.window.showWarningMessage(`Conflict analysis: ${summary}; locations unavailable.`);
    return;
  }
  await vscode.window.showInformationMessage(`Conflict analysis: ${summary}.`);
};

export const registerConflictAnalysis = (context: vscode.ExtensionContext): void => {
  const diagnostics = vscode.languages.createDiagnosticCollection("syntaxpad-conflicts");
  context.subscriptions.push(
    diagnostics,
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (isGrammarDocument(event.document)) {
        diagnostics.delete(event.document.uri);
      }
    }),
    vscode.commands.registerCommand("syntaxpad.runConflicts", async (input: unknown) => {
      const target = parseConflictCommandTarget(input);
      if (target.kind === "invalid") {
        await vscode.window.showErrorMessage("The conflict analysis request was invalid.");
        return;
      }
      let document: vscode.TextDocument | undefined;
      try {
        document =
          target.kind === "document"
            ? await vscode.workspace.openTextDocument(vscode.Uri.parse(target.uri, true))
            : vscode.window.activeTextEditor?.document;
      } catch {
        await vscode.window.showErrorMessage(
          "The grammar selected for conflict analysis could not be opened.",
        );
        return;
      }
      if (!isGrammarDocument(document)) {
        await vscode.window.showErrorMessage("Open a Bison, Yacc, or Lrama grammar first.");
        return;
      }
      if (!vscode.workspace.isTrusted) {
        await vscode.window.showErrorMessage(
          "Conflict analysis is disabled until this workspace is trusted.",
        );
        return;
      }
      const configuration = readConfiguration(document);
      if (configuration instanceof z.ZodError) {
        await vscode.window.showErrorMessage(
          `Invalid SyntaxPad tool configuration: ${configuration.issues[0]?.message ?? "unknown error"}`,
        );
        return;
      }
      if (!(await confirmInvocation(context, configuration))) {
        return;
      }

      const controller = new AbortController();
      const report = await vscode.window.withProgress(
        {
          cancellable: true,
          location: vscode.ProgressLocation.Notification,
          title: `SyntaxPad: running ${configuration.tool}`,
        },
        async (_progress, cancellation) => {
          const cancellationSubscription = cancellation.onCancellationRequested(() => {
            controller.abort();
          });
          try {
            return await runConflictAnalysis({
              additionalArguments: configuration.additionalArguments,
              executable: configuration.executable,
              maxOutputBytes: configuration.maxOutputKiB * 1_024,
              signal: controller.signal,
              source: document.getText(),
              timeoutMs: configuration.timeoutMs,
              tool: configuration.tool,
            });
          } finally {
            cancellationSubscription.dispose();
          }
        },
      );
      diagnostics.set(document.uri, conflictDiagnostics(document, report));
      await SyntaxPadPanel.publishConflicts(document.uri, document.version, report);
      await showReportResult(report);
    }),
  );
};
