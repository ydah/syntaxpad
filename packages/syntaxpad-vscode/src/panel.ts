import {
  analyzeGrammar,
  findRuleAtOffset,
  parseGrammar,
  type Dialect,
  type GrammarDocument,
  type GrammarModel,
  type SourceRange,
} from "@syntaxpad/core";
import type { DependencyMode } from "@syntaxpad/viz";
import type { ConflictReport } from "@syntaxpad/tools";
import { randomBytes } from "node:crypto";
import * as vscode from "vscode";

import { type HostMessage, type ViewMessage, viewMessageSchema } from "./protocol.js";
import { createGrammarViewModel } from "./view-model.js";

interface CachedGrammar {
  readonly document: GrammarDocument;
  readonly model: GrammarModel;
  readonly uri: string;
  readonly version: number;
}

interface VersionedConflictReport {
  readonly report: ConflictReport;
  readonly uri: string;
  readonly version: number;
}

const isGrammarEditor = (editor: vscode.TextEditor | undefined): editor is vscode.TextEditor =>
  editor !== undefined &&
  (editor.document.languageId === "yacc" ||
    editor.document.fileName.endsWith(".y") ||
    editor.document.fileName.endsWith(".yy"));

const configuredDialect = (document: vscode.TextDocument): Dialect => {
  const configured = vscode.workspace
    .getConfiguration("syntaxpad", document.uri)
    .get<string>("dialect", "bison");
  return configured === "yacc" || configured === "lrama" ? configured : "bison";
};

const nonce = (): string => randomBytes(18).toString("base64url");

export class SyntaxPadPanel implements vscode.Disposable {
  private static current: SyntaxPadPanel | undefined;
  private static latestConflicts: VersionedConflictReport | undefined;
  private static metrics: vscode.OutputChannel | undefined;

  private cache: CachedGrammar | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private distance = 1;
  private foldRecursion = true;
  private graphMode: DependencyMode = "neighborhood";
  private query = "";
  private selectedRuleName: string | undefined;
  private updateTimer: ReturnType<typeof setTimeout> | undefined;

  private constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly panel: vscode.WebviewPanel,
  ) {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist")],
    };
    panel.webview.html = this.html(panel.webview);
    panel.onDidDispose(
      () => {
        this.dispose();
      },
      undefined,
      this.disposables,
    );
    panel.webview.onDidReceiveMessage(
      (message: unknown) => {
        void this.handleMessage(message);
      },
      undefined,
      this.disposables,
    );
    vscode.workspace.onDidChangeTextDocument(
      (event) => {
        if (event.document.uri.toString() === this.cache?.uri) {
          this.scheduleUpdate();
        }
      },
      undefined,
      this.disposables,
    );
    vscode.window.onDidChangeTextEditorSelection(
      (event) => {
        if (event.textEditor.document.uri.toString() === this.cache?.uri) {
          this.followSelection(event.textEditor);
        }
      },
      undefined,
      this.disposables,
    );
    vscode.window.onDidChangeActiveTextEditor(
      () => {
        void this.update();
      },
      undefined,
      this.disposables,
    );
  }

  public static async show(extensionUri: vscode.Uri): Promise<void> {
    if (SyntaxPadPanel.current !== undefined) {
      SyntaxPadPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      await SyntaxPadPanel.current.update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "syntaxpad.grammar",
      "SyntaxPad",
      vscode.ViewColumn.Beside,
      { enableFindWidget: true, retainContextWhenHidden: true },
    );
    SyntaxPadPanel.current = new SyntaxPadPanel(extensionUri, panel);
    await SyntaxPadPanel.current.update();
  }

  public static async publishConflicts(
    uri: vscode.Uri,
    version: number,
    report: ConflictReport,
  ): Promise<void> {
    SyntaxPadPanel.latestConflicts = { report, uri: uri.toString(), version };
    await SyntaxPadPanel.current?.render();
  }

  public static setMetricsChannel(channel: vscode.OutputChannel): void {
    SyntaxPadPanel.metrics = channel;
  }

  public dispose(): void {
    if (SyntaxPadPanel.current === this) {
      SyntaxPadPanel.current = undefined;
    }
    if (this.updateTimer !== undefined) {
      clearTimeout(this.updateTimer);
    }
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private scheduleUpdate(): void {
    if (this.updateTimer !== undefined) {
      clearTimeout(this.updateTimer);
    }
    this.updateTimer = setTimeout(() => {
      this.updateTimer = undefined;
      void this.update(true);
    }, 120);
  }

  private async post(message: HostMessage): Promise<void> {
    await this.panel.webview.postMessage(message);
  }

  private recordMetric(kind: "cursor-highlight" | "diagram-navigation", durationMs: number): void {
    const targetMs = 50;
    const hardLimitMs = 100;
    const result =
      durationMs <= targetMs ? "target" : durationMs <= hardLimitMs ? "within limit" : "over limit";
    SyntaxPadPanel.metrics?.appendLine(
      `${new Date().toISOString()} ${kind}: ${durationMs.toFixed(1)} ms (${result}; target ${String(targetMs)} ms, limit ${String(hardLimitMs)} ms)`,
    );
  }

  private followSelection(editor: vscode.TextEditor): void {
    const sentAt = Date.now();
    const offset = editor.document.offsetAt(editor.selection.active);
    const selectedRule = this.cache?.document
      ? findRuleAtOffset(this.cache.document, offset)
      : undefined;
    if (selectedRule !== undefined && selectedRule.name !== this.selectedRuleName) {
      this.selectedRuleName = selectedRule.name;
      void this.render(sentAt);
      return;
    }
    void this.post({ offset, sentAt, type: "selection" });
  }

  private async update(force = false): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!isGrammarEditor(editor)) {
      await this.post({
        message: "Open a Bison, Yacc, or Lrama grammar file to populate this view.",
        type: "error",
      });
      return;
    }

    const uri = editor.document.uri.toString();
    if (force || this.cache?.uri !== uri || this.cache.version !== editor.document.version) {
      const document = parseGrammar(editor.document.getText(), {
        dialect: configuredDialect(editor.document),
      });
      this.cache = {
        document,
        model: analyzeGrammar(document),
        uri,
        version: editor.document.version,
      };
    }
    const offset = editor.document.offsetAt(editor.selection.active);
    this.selectedRuleName =
      findRuleAtOffset(this.cache.document, offset)?.name ??
      this.selectedRuleName ??
      this.cache.model.startSymbol;
    await this.render();
    await this.post({ offset, type: "selection" });
  }

  private async render(sentAt?: number): Promise<void> {
    if (this.cache === undefined) {
      return;
    }
    const conflicts = SyntaxPadPanel.latestConflicts;
    const currentConflicts =
      conflicts?.uri === this.cache.uri && conflicts.version === this.cache.version
        ? conflicts.report
        : undefined;
    const model = createGrammarViewModel({
      document: this.cache.document,
      model: this.cache.model,
      state: {
        distance: this.distance,
        foldRecursion: this.foldRecursion,
        graphMode: this.graphMode,
        query: this.query,
        ...(currentConflicts === undefined ? {} : { conflictReport: currentConflicts }),
        ...(this.selectedRuleName === undefined ? {} : { selectedRuleName: this.selectedRuleName }),
      },
      uri: this.cache.uri,
      version: this.cache.version,
    });
    if (model === undefined) {
      await this.post({
        message: "No grammar rule could be parsed from this document.",
        type: "error",
      });
      return;
    }
    this.selectedRuleName = model.selectedRuleName;
    await this.post({ model, ...(sentAt === undefined ? {} : { sentAt }), type: "model" });
  }

  private async navigate(message: Extract<ViewMessage, { type: "navigate" }>): Promise<void> {
    const sourceRange: SourceRange = { end: message.end, start: message.start };
    let targetRange = sourceRange;
    if (message.preferDefinition && this.cache !== undefined) {
      const reference = this.cache.model.references.find(
        (candidate) =>
          candidate.range.start === sourceRange.start &&
          candidate.range.end === sourceRange.end &&
          candidate.kind === "nonterminal",
      );
      const definition =
        reference === undefined ? undefined : this.cache.model.definitions.get(reference.name)?.[0];
      if (definition !== undefined) {
        targetRange = definition.range;
      }
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(message.uri));
    const editor = await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.One,
    });
    const range = new vscode.Range(
      document.positionAt(targetRange.start),
      document.positionAt(targetRange.end),
    );
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    if (message.startedAt !== undefined) {
      this.recordMetric("diagram-navigation", Math.max(0, Date.now() - message.startedAt));
    }
  }

  private async handleMessage(input: unknown): Promise<void> {
    const parsed = viewMessageSchema.safeParse(input);
    if (!parsed.success) {
      await this.post({ message: "Ignored an invalid Webview message.", type: "error" });
      return;
    }
    const message = parsed.data;
    switch (message.type) {
      case "ready":
        await this.update();
        return;
      case "navigate":
        await this.navigate(message);
        return;
      case "selectRule":
        this.selectedRuleName = message.symbol;
        await this.render();
        return;
      case "toggleFold":
        this.foldRecursion = message.folded;
        await this.render();
        return;
      case "setGraph":
        this.distance = message.distance;
        this.graphMode = message.mode;
        await this.render();
        return;
      case "search":
        this.query = message.query;
        await this.render();
        return;
      case "moveAlternative":
        await vscode.commands.executeCommand("syntaxpad.reorderAlternatives", {
          from: message.from,
          ruleId: message.ruleId,
          to: message.to,
          uri: this.cache?.uri ?? "",
        });
        return;
      case "performance":
        this.recordMetric(message.kind, message.durationMs);
        return;
      case "runConflicts":
        await vscode.commands.executeCommand(`syntaxpad.${message.type}`);
    }
  }

  private html(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.css"),
    );
    const pageNonce = nonce();
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${pageNonce}';">
  <link rel="stylesheet" href="${styleUri.toString()}">
  <title>SyntaxPad</title>
</head>
<body>
  <header class="toolbar" aria-label="Grammar view controls">
    <label>Rule <select id="rule-select" aria-label="Selected grammar rule"></select></label>
    <label class="search-label"><span class="sr-only">Search rules</span><input id="search" type="search" placeholder="Search rules…" autocomplete="off"></label>
    <label>View <select id="graph-mode"><option value="neighborhood">Neighborhood</option><option value="reachable">Reachable</option><option value="all">Whole graph</option></select></label>
    <label>Distance <select id="distance"><option>0</option><option selected>1</option><option>2</option><option>3</option></select></label>
    <button id="fold-toggle" type="button" aria-pressed="true">Fold recursion</button>
    <button id="run-conflicts" type="button">Run conflicts</button>
  </header>
  <main>
    <section class="pane railroad-pane" aria-labelledby="railroad-title">
      <div class="pane-heading"><h1 id="railroad-title">Railroad</h1><span id="rule-name"></span></div>
      <div id="railroad" class="diagram" tabindex="0"></div>
      <div id="alternative-controls" class="alternative-controls" aria-label="Reorder alternatives"></div>
    </section>
    <section class="pane dependency-pane" aria-labelledby="dependency-title">
      <div class="pane-heading"><h1 id="dependency-title">Dependencies</h1><span id="graph-note"></span></div>
      <div id="dependency" class="diagram" tabindex="0"></div>
    </section>
    <section class="pane conflict-pane" aria-labelledby="conflict-title">
      <div class="pane-heading"><h1 id="conflict-title">Conflicts</h1><span id="conflict-summary">Not run</span></div>
      <div id="conflicts" class="conflict-list"><p>Run conflict analysis to inspect parser-generator results.</p></div>
    </section>
  </main>
  <footer id="status" role="status" aria-live="polite">Waiting for a grammar…</footer>
  <script nonce="${pageNonce}" src="${scriptUri.toString()}"></script>
</body>
</html>`;
  }
}
