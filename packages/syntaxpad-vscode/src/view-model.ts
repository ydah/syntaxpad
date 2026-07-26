import type { GrammarDocument, GrammarModel } from "@syntaxpad/core";
import type { ConflictReport } from "@syntaxpad/tools";
import {
  createDependencyGraph,
  createRailroadView,
  renderDependencySvg,
  renderRailroadSvg,
} from "@syntaxpad/viz";
import type { DependencyMode } from "@syntaxpad/viz";

import type { GrammarViewModel } from "./protocol.js";

export interface ViewState {
  readonly conflictReport?: ConflictReport;
  readonly distance: number;
  readonly foldRecursion: boolean;
  readonly graphMode: DependencyMode;
  readonly query: string;
  readonly selectedRuleName?: string;
}

export const createGrammarViewModel = (options: {
  readonly document: GrammarDocument;
  readonly model: GrammarModel;
  readonly state: ViewState;
  readonly uri: string;
  readonly version: number;
}): GrammarViewModel | undefined => {
  const selectedRule =
    options.document.rules.find((rule) => rule.name === options.state.selectedRuleName) ??
    options.document.rules.find((rule) => rule.name === options.model.startSymbol) ??
    options.document.rules[0];
  if (selectedRule === undefined) {
    return undefined;
  }

  const conflictRules = new Set(
    options.state.conflictReport?.conflicts.flatMap((conflict) => conflict.ruleNames) ?? [],
  );
  const railroad = renderRailroadSvg(
    createRailroadView(selectedRule, {
      conflict: conflictRules.has(selectedRule.name),
      foldRecursion: options.state.foldRecursion,
    }),
  );
  const graph = createDependencyGraph(options.document, options.model, {
    distance: options.state.distance,
    mode: options.state.graphMode,
    query: options.state.query,
    selected: selectedRule.name,
    conflictRules,
  });
  const dependency = renderDependencySvg(graph);
  return {
    alternatives: selectedRule.alternatives.map((alternative) => ({
      index: alternative.index,
      label:
        options.document.source
          .slice(alternative.range.start, alternative.range.end)
          .replace(/\s+/gu, " ")
          .trim()
          .slice(0, 80) || "empty",
    })),
    ...(options.state.conflictReport === undefined
      ? {}
      : {
          conflictReport: {
            conflicts: options.state.conflictReport.conflicts.map((conflictItem) => ({
              ...conflictItem,
              ruleNames: [...conflictItem.ruleNames],
              targets: conflictItem.ruleNames.flatMap((ruleName) => {
                const rule = options.document.rules.find(
                  (candidate) => candidate.name === ruleName,
                );
                return rule === undefined
                  ? []
                  : [
                      {
                        end: rule.nameRange.end,
                        ruleName,
                        start: rule.nameRange.start,
                      },
                    ];
              }),
            })),
            detail: options.state.conflictReport.detail,
            format: options.state.conflictReport.format,
            messages: [...options.state.conflictReport.messages],
            tool: options.state.conflictReport.tool,
            totals: options.state.conflictReport.totals,
            truncated: options.state.conflictReport.truncated,
          },
        }),
    dependencySvg: dependency.svg,
    diagnostics: options.model.diagnostics.length,
    distance: options.state.distance,
    folded: railroad.folded,
    foldingEnabled: options.state.foldRecursion,
    graphMode: options.state.graphMode,
    references: options.model.references.length,
    railroadSvg: railroad.svg,
    ruleCount: options.document.rules.length,
    rules: options.document.rules.map((rule) => ({ id: rule.id, name: rule.name })),
    selectedRuleId: selectedRule.id,
    selectedRuleName: selectedRule.name,
    truncated: graph.truncated,
    uri: options.uri,
    version: options.version,
  };
};
