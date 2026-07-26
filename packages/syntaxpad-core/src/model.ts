import { getDialectProfile } from "./dialect.js";
import type {
  ActionReference,
  AlternativeItem,
  DependencyEdge,
  GrammarDiagnostic,
  GrammarDocument,
  GrammarModel,
  RuleNode,
  SourceRange,
  SymbolDefinition,
  SymbolReference,
} from "./types.js";

const TERMINAL_DIRECTIVES = new Set(["%left", "%nonassoc", "%precedence", "%right", "%token"]);

const semanticItem = (item: AlternativeItem): boolean =>
  item.kind === "action" ||
  item.kind === "literal" ||
  item.kind === "parameterized" ||
  item.kind === "symbol";

const namedItemsBefore = (
  items: readonly AlternativeItem[],
  endIndex: number,
): ReadonlySet<string> => {
  const names = new Set<string>();
  items.slice(0, endIndex).forEach((item) => {
    if (item.kind === "symbol" || item.kind === "parameterized") {
      names.add(item.name);
      if (item.namedReference !== undefined) {
        names.add(item.namedReference.name);
      }
    }
  });
  return names;
};

const collectActionDiagnostics = (rule: RuleNode): readonly GrammarDiagnostic[] => {
  const diagnostics: GrammarDiagnostic[] = [];
  for (const alternative of rule.alternatives) {
    alternative.items.forEach((item, itemIndex) => {
      if (item.kind !== "action") {
        return;
      }
      const availableSlots = alternative.items.slice(0, itemIndex).filter(semanticItem).length;
      const availableNames = namedItemsBefore(alternative.items, itemIndex);
      for (const reference of item.references) {
        if (
          reference.target.kind === "index" &&
          (reference.target.index < 1 || reference.target.index > availableSlots)
        ) {
          diagnostics.push({
            code: "action-index-out-of-range",
            message: `${reference.kind === "value" ? "$" : "@"}${String(reference.target.index)} is out of range; ${String(availableSlots)} semantic position(s) are available here.`,
            range: reference.range,
            severity: "error",
          });
        }
        if (reference.target.kind === "name" && !availableNames.has(reference.target.name)) {
          diagnostics.push({
            code: "action-name-not-found",
            message: `Action reference "${reference.target.name}" does not name an available symbol.`,
            range: reference.range,
            severity: "error",
          });
        }
      }
    });
  }
  return diagnostics;
};

const createDefinitions = (
  document: GrammarDocument,
): ReadonlyMap<string, readonly SymbolDefinition[]> => {
  const mutable = new Map<string, SymbolDefinition[]>();
  for (const rule of document.rules) {
    const definitions = mutable.get(rule.name) ?? [];
    definitions.push({ name: rule.name, range: rule.nameRange, ruleId: rule.id });
    mutable.set(rule.name, definitions);
  }
  return mutable;
};

const collectTerminals = (document: GrammarDocument): ReadonlySet<string> => {
  const terminals = new Set<string>();
  document.declarations.forEach((declaration) => {
    if (TERMINAL_DIRECTIVES.has(declaration.directive)) {
      declaration.symbols.forEach((symbol) => terminals.add(symbol.name));
    }
  });
  document.rules.forEach((rule) => {
    rule.alternatives.forEach((alternative) => {
      alternative.items.forEach((item) => {
        if (item.kind === "literal") {
          terminals.add(item.text);
        }
      });
    });
  });
  return terminals;
};

const addEdgeRange = (
  edgeRanges: Map<string, SourceRange[]>,
  from: string,
  to: string,
  range: SourceRange,
): void => {
  const key = `${from}\u0000${to}`;
  const ranges = edgeRanges.get(key) ?? [];
  ranges.push(range);
  edgeRanges.set(key, ranges);
};

const createEdges = (edgeRanges: ReadonlyMap<string, readonly SourceRange[]>): DependencyEdge[] =>
  [...edgeRanges.entries()].map(([key, ranges]) => {
    const [from = "", to = ""] = key.split("\u0000");
    return { from, ranges, to };
  });

const findStartSymbol = (document: GrammarDocument): string | undefined =>
  document.declarations.find((declaration) => declaration.directive === "%start")?.symbols[0]
    ?.name ?? document.rules[0]?.name;

const calculateReachability = (
  startSymbol: string | undefined,
  rules: readonly RuleNode[],
  edges: readonly DependencyEdge[],
): ReadonlySet<string> => {
  const reachable = new Set<string>();
  if (startSymbol === undefined) {
    return reachable;
  }
  const adjacency = new Map<string, string[]>();
  edges.forEach((edge) => {
    const targets = adjacency.get(edge.from) ?? [];
    targets.push(edge.to);
    adjacency.set(edge.from, targets);
  });
  const pending = [startSymbol];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || reachable.has(current)) {
      continue;
    }
    reachable.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  return new Set(rules.map((rule) => rule.name).filter((name) => !reachable.has(name)));
};

const createStructuralDiagnostics = (
  document: GrammarDocument,
  definitions: ReadonlyMap<string, readonly SymbolDefinition[]>,
  references: readonly SymbolReference[],
  unusedRules: ReadonlySet<string>,
  unreachableRules: ReadonlySet<string>,
): readonly GrammarDiagnostic[] => {
  const diagnostics: GrammarDiagnostic[] = [];
  definitions.forEach((entries, name) => {
    entries.slice(1).forEach((entry) => {
      diagnostics.push({
        code: "duplicate-rule",
        message: `Rule "${name}" is defined more than once.`,
        range: entry.range,
        severity: "error",
      });
    });
  });
  references
    .filter((reference) => reference.kind === "undefined")
    .forEach((reference) => {
      diagnostics.push({
        code: "undefined-symbol",
        message: `Symbol "${reference.name}" is not defined or declared.`,
        range: reference.range,
        severity: "error",
      });
    });
  document.rules.forEach((rule) => {
    if (unusedRules.has(rule.name)) {
      diagnostics.push({
        code: "unused-rule",
        message: `Rule "${rule.name}" is never referenced.`,
        range: rule.nameRange,
        severity: "warning",
      });
    }
    if (unreachableRules.has(rule.name)) {
      diagnostics.push({
        code: "unreachable-rule",
        message: `Rule "${rule.name}" is unreachable from the start symbol.`,
        range: rule.nameRange,
        severity: "warning",
      });
    }
    diagnostics.push(...collectActionDiagnostics(rule));
  });
  return diagnostics;
};

export const analyzeGrammar = (document: GrammarDocument): GrammarModel => {
  const definitions = createDefinitions(document);
  const terminals = collectTerminals(document);
  const profile = getDialectProfile(document.dialect);
  const references: SymbolReference[] = [];
  const actionReferences: ActionReference[] = [];
  const edgeRanges = new Map<string, SourceRange[]>();

  document.rules.forEach((rule) => {
    const parameters = new Set(rule.parameterNames.map((parameter) => parameter.name));
    rule.alternatives.forEach((alternative) => {
      alternative.items.forEach((item) => {
        if (item.kind === "action") {
          actionReferences.push(...item.references);
          return;
        }
        const candidates =
          item.kind === "symbol"
            ? [{ name: item.name, range: item.nameRange }]
            : item.kind === "parameterized"
              ? [{ name: item.name, range: item.nameRange }, ...item.arguments]
              : [];
        candidates.forEach((candidate) => {
          if (parameters.has(candidate.name) || profile.standardRules.has(candidate.name)) {
            return;
          }
          const isNonterminal = definitions.has(candidate.name);
          const kind = isNonterminal
            ? "nonterminal"
            : terminals.has(candidate.name)
              ? "terminal"
              : "undefined";
          references.push({
            fromRuleId: rule.id,
            kind,
            name: candidate.name,
            range: candidate.range,
          });
          if (isNonterminal) {
            addEdgeRange(edgeRanges, rule.name, candidate.name, candidate.range);
          }
        });
      });
    });
  });

  const edges = createEdges(edgeRanges);
  const startSymbol = findStartSymbol(document);
  const incoming = new Set(edges.map((edge) => edge.to));
  const unusedRules = new Set(
    document.rules
      .map((rule) => rule.name)
      .filter((name) => name !== startSymbol && !incoming.has(name)),
  );
  const unreachableRules = calculateReachability(startSymbol, document.rules, edges);
  const diagnostics = [
    ...document.diagnostics,
    ...createStructuralDiagnostics(
      document,
      definitions,
      references,
      unusedRules,
      unreachableRules,
    ),
  ];

  const base = {
    actionReferences,
    definitions,
    diagnostics,
    edges,
    references,
    terminals,
    unreachableRules,
    unusedRules,
  };
  return startSymbol === undefined ? base : { ...base, startSymbol };
};
