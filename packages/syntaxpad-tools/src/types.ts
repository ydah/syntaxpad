export type ToolKind = "bison" | "lrama";
export type ConflictKind = "reduce/reduce" | "shift/reduce";
export type ReportDetail = "counts-only" | "failed" | "full";
export type ReportFormat = "bison-text" | "bison-xml" | "lrama-text" | "none";

export interface ConflictTotals {
  readonly reduceReduce: number;
  readonly shiftReduce: number;
}

export interface GrammarConflict {
  readonly counterexample?: string;
  readonly id: string;
  readonly kind: ConflictKind;
  readonly message: string;
  readonly ruleNames: readonly string[];
  readonly state?: number;
  readonly token?: string;
}

export interface ConflictReport {
  readonly conflicts: readonly GrammarConflict[];
  readonly detail: ReportDetail;
  readonly format: ReportFormat;
  readonly messages: readonly string[];
  readonly tool: ToolKind;
  readonly totals: ConflictTotals;
  readonly truncated: boolean;
}

export interface ToolInvocation {
  readonly args: readonly string[];
  readonly executable: string;
}

export interface ConflictRunRequest {
  readonly additionalArguments?: readonly string[];
  readonly executable: string;
  readonly maxOutputBytes?: number;
  readonly signal?: AbortSignal;
  readonly source: string;
  readonly timeoutMs?: number;
  readonly tool: ToolKind;
}

export interface ToolExecution {
  readonly aborted: boolean;
  readonly code: number | null;
  readonly error?: string;
  readonly invocation: ToolInvocation;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
  readonly stdout: string;
  readonly timedOut: boolean;
  readonly truncated: boolean;
}
