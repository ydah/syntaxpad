import {
  addAlternative,
  type Dialect,
  type GrammarDiagnostic,
  type SourceRange,
  type TransformPlan,
} from "@syntaxpad/core";
import {
  CodeActionKind,
  CompletionItemKind,
  createConnection,
  DiagnosticSeverity,
  ErrorCodes,
  MarkupKind,
  ProposedFeatures,
  ResponseError,
  SymbolKind,
  TextDocumentSyncKind,
  TextDocuments,
  TextEdit,
  type CodeAction,
  type CompletionItem,
  type Diagnostic,
  type DocumentSymbol,
  type FoldingRange,
  type Hover,
  type InitializeParams,
  type InitializeResult,
  type Location,
  type Range,
  type WorkspaceEdit,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
  createSnapshot,
  getCompletions,
  getDefinitionRanges,
  getDocumentSymbols,
  getHover,
  getReferenceRanges,
  getServiceFoldingRanges,
  renameAtOffset,
  ruleNameAtOffset,
  symbolAtOffset,
  type LanguageSnapshot,
} from "./language-service.js";

interface CachedSnapshot {
  readonly dialect: Dialect;
  readonly snapshot: LanguageSnapshot;
  readonly version: number;
}

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const snapshots = new Map<string, CachedSnapshot>();
const validationTimers = new Map<string, ReturnType<typeof setTimeout>>();
let supportsConfiguration = false;

const toRange = (document: TextDocument, range: SourceRange): Range => ({
  end: document.positionAt(range.end),
  start: document.positionAt(range.start),
});

const diagnosticSeverity = (severity: GrammarDiagnostic["severity"]): DiagnosticSeverity => {
  switch (severity) {
    case "error":
      return DiagnosticSeverity.Error;
    case "warning":
      return DiagnosticSeverity.Warning;
    case "information":
      return DiagnosticSeverity.Information;
  }
};

const dialectFor = async (uri: string): Promise<Dialect> => {
  if (!supportsConfiguration) {
    return "bison";
  }
  const configured: unknown = await connection.workspace.getConfiguration({
    scopeUri: uri,
    section: "syntaxpad.dialect",
  });
  return configured === "yacc" || configured === "lrama" ? configured : "bison";
};

const snapshotFor = async (document: TextDocument): Promise<LanguageSnapshot> => {
  const dialect = await dialectFor(document.uri);
  const cached = snapshots.get(document.uri);
  if (cached?.version === document.version && cached.dialect === dialect) {
    return cached.snapshot;
  }
  const snapshot = createSnapshot(document.getText(), dialect);
  snapshots.set(document.uri, { dialect, snapshot, version: document.version });
  return snapshot;
};

const publishDiagnostics = async (document: TextDocument, startedAt?: number): Promise<void> => {
  const version = document.version;
  const snapshot = await snapshotFor(document);
  if (documents.get(document.uri)?.version !== version) {
    return;
  }
  const diagnostics: Diagnostic[] = snapshot.model.diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    message: diagnostic.message,
    range: toRange(document, diagnostic.range),
    severity: diagnosticSeverity(diagnostic.severity),
    source: "SyntaxPad",
  }));
  await connection.sendDiagnostics({ diagnostics, uri: document.uri, version });
  if (startedAt !== undefined) {
    const durationMs = Date.now() - startedAt;
    const result =
      durationMs <= 300 ? "target" : durationMs <= 1_000 ? "within limit" : "over limit";
    connection.console.log(
      `diagnostics: ${String(durationMs)} ms (${result}; target 300 ms, limit 1000 ms)`,
    );
  }
};

const scheduleDiagnostics = (document: TextDocument, delay = 120): void => {
  const startedAt = Date.now();
  const previous = validationTimers.get(document.uri);
  if (previous !== undefined) {
    clearTimeout(previous);
  }
  validationTimers.set(
    document.uri,
    setTimeout(() => {
      validationTimers.delete(document.uri);
      void publishDiagnostics(document, startedAt).catch((error: unknown) => {
        connection.console.error(
          error instanceof Error ? error.message : "Failed to publish diagnostics.",
        );
      });
    }, delay),
  );
};

const completionKind = (kind: "directive" | "nonterminal" | "token"): CompletionItemKind => {
  switch (kind) {
    case "directive":
      return CompletionItemKind.Keyword;
    case "nonterminal":
      return CompletionItemKind.Function;
    case "token":
      return CompletionItemKind.EnumMember;
  }
};

const toWorkspaceEdit = (document: TextDocument, plan: TransformPlan): WorkspaceEdit => ({
  changes: {
    [document.uri]: plan.patches.map((patch) =>
      TextEdit.replace(toRange(document, patch.range), patch.text),
    ),
  },
});

connection.onInitialize((params: InitializeParams): InitializeResult => {
  supportsConfiguration = params.capabilities.workspace?.configuration === true;
  return {
    capabilities: {
      codeActionProvider: true,
      completionProvider: { resolveProvider: false, triggerCharacters: ["%", "$", "@"] },
      definitionProvider: true,
      documentSymbolProvider: true,
      foldingRangeProvider: true,
      hoverProvider: true,
      referencesProvider: true,
      renameProvider: { prepareProvider: true },
      textDocumentSync: TextDocumentSyncKind.Incremental,
    },
    serverInfo: { name: "SyntaxPad Language Server", version: "0.1.0" },
  };
});

connection.onCompletion(async (params): Promise<CompletionItem[]> => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return [];
  }
  const snapshot = await snapshotFor(document);
  return getCompletions(snapshot, document.offsetAt(params.position)).map((item) => ({
    detail: item.detail,
    kind: completionKind(item.kind),
    label: item.label,
  }));
});

connection.onHover(async (params): Promise<Hover | undefined> => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return undefined;
  }
  const hover = getHover(await snapshotFor(document), document.offsetAt(params.position));
  return hover === undefined
    ? undefined
    : {
        contents: { kind: MarkupKind.Markdown, value: hover.markdown },
        range: toRange(document, hover.range),
      };
});

connection.onDefinition(async (params): Promise<Location[]> => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return [];
  }
  return getDefinitionRanges(await snapshotFor(document), document.offsetAt(params.position)).map(
    (range) => ({ range: toRange(document, range), uri: document.uri }),
  );
});

connection.onReferences(async (params): Promise<Location[]> => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return [];
  }
  return getReferenceRanges(
    await snapshotFor(document),
    document.offsetAt(params.position),
    params.context.includeDeclaration,
  ).map((range) => ({ range: toRange(document, range), uri: document.uri }));
});

connection.onPrepareRename(async (params): Promise<Range | undefined> => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return undefined;
  }
  const symbol = symbolAtOffset(await snapshotFor(document), document.offsetAt(params.position));
  return symbol === undefined ? undefined : toRange(document, symbol.range);
});

connection.onRenameRequest(async (params): Promise<WorkspaceEdit> => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    throw new ResponseError(ErrorCodes.InvalidParams, "The document is not open.");
  }
  const result = renameAtOffset(
    await snapshotFor(document),
    document.offsetAt(params.position),
    params.newName,
  );
  if (!result.ok) {
    throw new ResponseError(ErrorCodes.InvalidParams, result.error.message);
  }
  return toWorkspaceEdit(document, result.plan);
});

connection.onFoldingRanges(async (params): Promise<FoldingRange[]> => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return [];
  }
  return getServiceFoldingRanges(await snapshotFor(document)).map((range) => ({
    endLine: document.positionAt(range.end).line,
    kind: range.kind === "action" ? "region" : "imports",
    startLine: document.positionAt(range.start).line,
  }));
});

connection.onDocumentSymbol(async (params): Promise<DocumentSymbol[]> => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return [];
  }
  return getDocumentSymbols(await snapshotFor(document)).map((symbol) => ({
    detail: symbol.detail,
    kind: SymbolKind.Function,
    name: symbol.name,
    range: toRange(document, symbol.range),
    selectionRange: toRange(document, symbol.selectionRange),
  }));
});

connection.onCodeAction(async (params): Promise<CodeAction[]> => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return [];
  }
  const snapshot = await snapshotFor(document);
  const startOffset = document.offsetAt(params.range.start);
  const endOffset = document.offsetAt(params.range.end);
  const ruleName = ruleNameAtOffset(snapshot, startOffset);
  const actions: CodeAction[] = [];
  if (ruleName !== undefined) {
    const added = addAlternative(snapshot.document, ruleName);
    if (added.ok) {
      actions.push({
        edit: toWorkspaceEdit(document, added.plan),
        kind: CodeActionKind.RefactorRewrite,
        title: `Add alternative to ${ruleName}`,
      });
    }
    actions.push({
      command: {
        arguments: [{ ruleName, uri: document.uri }],
        command: "syntaxpad.inlineRule",
        title: `Inline ${ruleName}`,
      },
      kind: CodeActionKind.RefactorInline,
      title: `Inline ${ruleName}`,
    });
  }
  if (endOffset > startOffset) {
    const argument = { end: endOffset, start: startOffset, uri: document.uri };
    actions.push(
      {
        command: {
          arguments: [argument],
          command: "syntaxpad.extractRule",
          title: "Extract selected symbols to a rule",
        },
        kind: CodeActionKind.RefactorExtract,
        title: "Extract selected symbols to a rule",
      },
      {
        command: {
          arguments: [{ ...argument, kind: "option" }],
          command: "syntaxpad.wrapOption",
          title: "Wrap selection in option",
        },
        kind: CodeActionKind.RefactorRewrite,
        title: "Wrap selection in option",
      },
      {
        command: {
          arguments: [{ ...argument, kind: "list" }],
          command: "syntaxpad.wrapList",
          title: "Wrap selection in list",
        },
        kind: CodeActionKind.RefactorRewrite,
        title: "Wrap selection in list",
      },
    );
  }
  return actions;
});

connection.onDidChangeConfiguration(() => {
  snapshots.clear();
  documents.all().forEach((document) => {
    scheduleDiagnostics(document, 0);
  });
});

documents.onDidOpen((event) => {
  scheduleDiagnostics(event.document, 0);
});

documents.onDidChangeContent((event) => {
  snapshots.delete(event.document.uri);
  scheduleDiagnostics(event.document);
});

documents.onDidClose((event) => {
  snapshots.delete(event.document.uri);
  const timer = validationTimers.get(event.document.uri);
  if (timer !== undefined) {
    clearTimeout(timer);
    validationTimers.delete(event.document.uri);
  }
  void connection.sendDiagnostics({ diagnostics: [], uri: event.document.uri });
});

documents.listen(connection);
connection.listen();
