import type { SourceRange } from "@syntaxpad/core";

export type RailroadElementKind =
  "action" | "empty" | "nonterminal" | "parameterized" | "precedence" | "terminal" | "unknown";

export interface RailroadElement {
  readonly kind: RailroadElementKind;
  readonly label: string;
  readonly range: SourceRange;
}

export interface RailroadLane {
  readonly elements: readonly RailroadElement[];
  readonly range: SourceRange;
}

export interface FoldedRecursion {
  readonly direction: "left" | "right";
  readonly item: readonly RailroadElement[];
  readonly optional: boolean;
  readonly range: SourceRange;
  readonly separator: readonly RailroadElement[];
}

export interface RailroadView {
  readonly conflict?: boolean;
  readonly folded?: FoldedRecursion;
  readonly lanes: readonly RailroadLane[];
  readonly name: string;
  readonly ruleId: string;
}

export interface SvgRender {
  readonly conflict?: boolean;
  readonly folded: boolean;
  readonly height: number;
  readonly svg: string;
  readonly width: number;
}

export type DependencyMode = "all" | "neighborhood" | "reachable";

export interface DependencyNode {
  readonly degree: number;
  readonly distanceFromStart?: number;
  readonly height: number;
  readonly id: string;
  readonly range?: SourceRange;
  readonly statuses: readonly ("conflict" | "undefined" | "unreachable" | "unused")[];
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface DependencyEdgeView {
  readonly from: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly to: string;
}

export interface DependencyGraphView {
  readonly edges: readonly DependencyEdgeView[];
  readonly height: number;
  readonly mode: DependencyMode;
  readonly nodes: readonly DependencyNode[];
  readonly truncated: boolean;
  readonly width: number;
}

export interface DependencyGraphOptions {
  readonly conflictRules?: ReadonlySet<string>;
  readonly distance?: number;
  readonly maxNodes?: number;
  readonly mode?: DependencyMode;
  readonly query?: string;
  readonly selected?: string;
}
