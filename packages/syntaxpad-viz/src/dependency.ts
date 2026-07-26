import { graphlib, layout } from "@dagrejs/dagre";
import type { EdgeLabel, GraphLabel, NodeLabel } from "@dagrejs/dagre";
import type { GrammarDocument, GrammarModel, SourceRange } from "@syntaxpad/core";

import type {
  DependencyEdgeView,
  DependencyGraphOptions,
  DependencyGraphView,
  DependencyMode,
  DependencyNode,
} from "./types.js";

interface EdgePair {
  readonly from: string;
  readonly to: string;
}

interface NodeSelectionOptions {
  readonly distance: number;
  readonly maxNodes: number;
  readonly mode: DependencyMode;
  readonly query: string | undefined;
  readonly selected: string | undefined;
}

const createEdgePairs = (document: GrammarDocument, model: GrammarModel): readonly EdgePair[] => {
  const pairs = model.edges.map((edge) => ({ from: edge.from, to: edge.to }));
  const namesByRuleId = new Map(document.rules.map((rule) => [rule.id, rule.name]));
  model.references
    .filter((reference) => reference.kind === "undefined")
    .forEach((reference) => {
      const from = namesByRuleId.get(reference.fromRuleId);
      if (from !== undefined) {
        pairs.push({ from, to: reference.name });
      }
    });
  return pairs;
};

const terminalSearchPairs = (
  document: GrammarDocument,
  model: GrammarModel,
  query: string | undefined,
): readonly EdgePair[] => {
  const normalized = query?.trim().toLocaleLowerCase();
  if (normalized === undefined || normalized.length === 0) {
    return [];
  }
  const namesByRuleId = new Map(document.rules.map((rule) => [rule.id, rule.name]));
  return model.references.flatMap((reference) => {
    if (reference.kind !== "terminal" || !reference.name.toLocaleLowerCase().includes(normalized)) {
      return [];
    }
    const from = namesByRuleId.get(reference.fromRuleId);
    return from === undefined ? [] : [{ from, to: reference.name }];
  });
};

const createAdjacency = (
  pairs: readonly EdgePair[],
  directed: boolean,
): ReadonlyMap<string, ReadonlySet<string>> => {
  const adjacency = new Map<string, Set<string>>();
  const add = (from: string, to: string): void => {
    const targets = adjacency.get(from) ?? new Set<string>();
    targets.add(to);
    adjacency.set(from, targets);
  };
  pairs.forEach((pair) => {
    add(pair.from, pair.to);
    if (!directed) {
      add(pair.to, pair.from);
    }
  });
  return adjacency;
};

const traverse = (
  start: string | undefined,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  maxDistance: number,
): ReadonlySet<string> => {
  const visited = new Set<string>();
  if (start === undefined) {
    return visited;
  }
  const pending: { distance: number; node: string }[] = [{ distance: 0, node: start }];
  while (pending.length > 0) {
    const current = pending.shift();
    if (current === undefined || current.distance > maxDistance || visited.has(current.node)) {
      continue;
    }
    visited.add(current.node);
    adjacency.get(current.node)?.forEach((target) => {
      pending.push({ distance: current.distance + 1, node: target });
    });
  }
  return visited;
};

const createDistances = (
  start: string | undefined,
  pairs: readonly EdgePair[],
): ReadonlyMap<string, number> => {
  const distances = new Map<string, number>();
  if (start === undefined) {
    return distances;
  }
  const adjacency = createAdjacency(pairs, true);
  const pending: { distance: number; node: string }[] = [{ distance: 0, node: start }];
  while (pending.length > 0) {
    const current = pending.shift();
    if (current === undefined || distances.has(current.node)) {
      continue;
    }
    distances.set(current.node, current.distance);
    adjacency.get(current.node)?.forEach((target) => {
      pending.push({ distance: current.distance + 1, node: target });
    });
  }
  return distances;
};

const selectNodes = (
  allNodes: ReadonlySet<string>,
  pairs: readonly EdgePair[],
  options: NodeSelectionOptions,
): { readonly nodes: ReadonlySet<string>; readonly truncated: boolean } => {
  let selected: ReadonlySet<string>;
  const query = options.query?.trim().toLocaleLowerCase();
  if (query !== undefined && query.length > 0) {
    const matches = new Set(
      [...allNodes].filter((node) => node.toLocaleLowerCase().includes(query)),
    );
    const expanded = new Set(matches);
    pairs.forEach((pair) => {
      if (matches.has(pair.from) || matches.has(pair.to)) {
        expanded.add(pair.from);
        expanded.add(pair.to);
      }
    });
    selected = expanded;
  } else if (options.mode === "all") {
    selected = allNodes;
  } else {
    const adjacency = createAdjacency(pairs, options.mode === "reachable");
    selected = traverse(
      options.selected,
      adjacency,
      options.mode === "reachable" ? Number.POSITIVE_INFINITY : options.distance,
    );
  }

  const filtered = [...selected];
  filtered.sort((left, right) => {
    if (left === options.selected) {
      return -1;
    }
    if (right === options.selected) {
      return 1;
    }
    return left.localeCompare(right);
  });
  const truncated = filtered.length > options.maxNodes;
  return { nodes: new Set(filtered.slice(0, options.maxNodes)), truncated };
};

const nodeRange = (document: GrammarDocument, id: string): SourceRange | undefined =>
  document.rules.find((rule) => rule.name === id)?.nameRange;

const nodeKind = (
  id: string,
  defined: ReadonlySet<string>,
  terminals: ReadonlySet<string>,
): DependencyNode["kind"] =>
  defined.has(id) ? "nonterminal" : terminals.has(id) ? "terminal" : "undefined";

const nodeStatuses = (
  model: GrammarModel,
  id: string,
  kind: DependencyNode["kind"],
  conflicts: ReadonlySet<string>,
): DependencyNode["statuses"] => {
  const statuses: DependencyNode["statuses"][number][] = [];
  if (kind === "undefined") {
    statuses.push("undefined");
  }
  if (conflicts.has(id)) {
    statuses.push("conflict");
  }
  if (model.unusedRules.has(id)) {
    statuses.push("unused");
  }
  if (model.unreachableRules.has(id)) {
    statuses.push("unreachable");
  }
  return statuses;
};

export const createDependencyGraph = (
  document: GrammarDocument,
  model: GrammarModel,
  input: DependencyGraphOptions = {},
): DependencyGraphView => {
  const mode: DependencyMode = input.mode ?? "neighborhood";
  const selected = input.selected ?? model.startSymbol ?? document.rules[0]?.name;
  const options = {
    distance: Math.max(0, input.distance ?? 1),
    maxNodes: Math.max(1, input.maxNodes ?? 1_000),
    mode,
    query: input.query,
    selected,
  };
  const pairs = [
    ...createEdgePairs(document, model),
    ...terminalSearchPairs(document, model, options.query),
  ];
  const defined = new Set(document.rules.map((rule) => rule.name));
  const allNodes = new Set(defined);
  pairs.forEach((pair) => {
    allNodes.add(pair.from);
    allNodes.add(pair.to);
  });
  const selection = selectNodes(allNodes, pairs, options);
  const visiblePairs = pairs.filter(
    (pair) => selection.nodes.has(pair.from) && selection.nodes.has(pair.to),
  );
  const degrees = new Map<string, number>();
  pairs.forEach((pair) => {
    degrees.set(pair.from, (degrees.get(pair.from) ?? 0) + 1);
    degrees.set(pair.to, (degrees.get(pair.to) ?? 0) + 1);
  });
  const distances = createDistances(model.startSymbol, pairs);
  const conflicts = input.conflictRules ?? new Set<string>();

  const graph = new graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>()
    .setDefaultEdgeLabel((): EdgeLabel => ({}))
    .setGraph({ marginx: 24, marginy: 24, nodesep: 38, rankdir: "LR", ranksep: 72 });
  selection.nodes.forEach((id) => {
    graph.setNode(id, {
      height: 44,
      width: Math.max(120, Math.min(240, id.length * 9 + 44)),
    });
  });
  visiblePairs.forEach((pair) => graph.setEdge(pair.from, pair.to));
  layout(graph);

  const nodes: DependencyNode[] = [];
  graph.nodes().forEach((id) => {
    const positioned = graph.node(id);
    if (positioned?.x === undefined || positioned.y === undefined) {
      return;
    }
    const range = nodeRange(document, id);
    const distanceFromStart = distances.get(id);
    const kind = nodeKind(id, defined, model.terminals);
    const base = {
      degree: degrees.get(id) ?? 0,
      height: positioned.height,
      id,
      kind,
      statuses: nodeStatuses(model, id, kind, conflicts),
      width: positioned.width,
      x: positioned.x,
      y: positioned.y,
    };
    nodes.push({
      ...base,
      ...(distanceFromStart === undefined ? {} : { distanceFromStart }),
      ...(range === undefined ? {} : { range }),
    });
  });

  const edges: DependencyEdgeView[] = graph.edges().map((edge) => {
    const value = graph.edge(edge);
    const points = value?.points ?? [];
    return {
      from: edge.v,
      points: points.map((point) => ({ x: point.x, y: point.y })),
      to: edge.w,
    };
  });
  const dimensions = graph.graph();
  return {
    edges,
    height: Math.max(120, dimensions.height ?? 0),
    mode,
    nodes,
    truncated: selection.truncated,
    width: Math.max(320, dimensions.width ?? 0),
  };
};
