import type { GrammarDocument, GrammarModel } from "@syntaxpad/core";
import {
  createDependencyGraph,
  createRailroadView,
  renderDependencySvg,
  renderRailroadSvg,
} from "@syntaxpad/viz";
import type { DependencyMode } from "@syntaxpad/viz";

import type { GrammarViewModel } from "./protocol.js";

export interface ViewState {
  readonly conflictRules?: ReadonlySet<string>;
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

  const railroad = renderRailroadSvg(
    createRailroadView(selectedRule, {
      foldRecursion: options.state.foldRecursion,
    }),
  );
  const graph = createDependencyGraph(options.document, options.model, {
    distance: options.state.distance,
    mode: options.state.graphMode,
    query: options.state.query,
    selected: selectedRule.name,
    ...(options.state.conflictRules === undefined
      ? {}
      : { conflictRules: options.state.conflictRules }),
  });
  const dependency = renderDependencySvg(graph);
  return {
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
