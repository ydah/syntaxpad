import { XMLParser } from "fast-xml-parser";

import type {
  ConflictKind,
  ConflictReport,
  GrammarConflict,
  ReportFormat,
  ToolExecution,
  ToolKind,
} from "./types.js";

const ZERO_TOTALS = { reduceReduce: 0, shiftReduce: 0 } as const;
const MAX_CONFLICT_ENTRIES = 1_000;

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const asArray = (value: unknown): readonly unknown[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const asString = (value: unknown): string | undefined => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  const record = asRecord(value);
  return record === undefined ? undefined : asString(record["#text"]);
};

const asNumber = (value: unknown): number | undefined => {
  const parsed = Number(asString(value));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
};

const nested = (
  value: unknown,
  ...path: readonly string[]
): Readonly<Record<string, unknown>> | undefined => {
  let current = asRecord(value);
  for (const part of path) {
    current = current === undefined ? undefined : asRecord(current[part]);
  }
  return current;
};

const unique = (values: readonly string[]): readonly string[] => [
  ...new Set(values.filter((value) => value.length > 0 && value !== "$accept")),
];

const conflict = (options: {
  readonly counterexample?: string;
  readonly format: ReportFormat;
  readonly kind: ConflictKind;
  readonly ruleNames: readonly string[];
  readonly state?: number;
  readonly token?: string;
}): GrammarConflict => {
  const location = options.state === undefined ? "" : ` in state ${String(options.state)}`;
  const token =
    options.token === undefined ||
    options.token === "unmapped" ||
    options.token.startsWith("conflict-")
      ? ""
      : ` on ${options.token}`;
  return {
    id: `${options.format}:${options.state === undefined ? "unknown" : String(options.state)}:${options.kind}:${options.token ?? "unknown"}`,
    kind: options.kind,
    message: `${options.kind} conflict${location}${token}`,
    ruleNames: unique(options.ruleNames),
    ...(options.counterexample === undefined ? {} : { counterexample: options.counterexample }),
    ...(options.state === undefined ? {} : { state: options.state }),
    ...(options.token === undefined ? {} : { token: options.token }),
  };
};

const diagnosticMessages = (execution: ToolExecution): readonly string[] => {
  const messages: string[] = [];
  if (execution.timedOut) {
    messages.push("The parser generator timed out.");
  }
  if (execution.aborted) {
    messages.push("Conflict analysis was cancelled.");
  }
  if (execution.error !== undefined) {
    messages.push(execution.error);
  }
  if (execution.code !== null && execution.code !== 0 && execution.stderr.trim().length > 0) {
    messages.push(execution.stderr.trim().slice(0, 2_000));
  }
  if (execution.truncated) {
    messages.push("Parser-generator output exceeded the capture limit and was truncated.");
  }
  return messages;
};

const report = (options: {
  readonly conflicts: readonly GrammarConflict[];
  readonly detail: ConflictReport["detail"];
  readonly execution: ToolExecution;
  readonly format: ReportFormat;
  readonly messages?: readonly string[];
  readonly tool: ToolKind;
  readonly totals?: ConflictReport["totals"];
}): ConflictReport => ({
  conflicts: options.conflicts,
  detail: options.detail,
  format: options.format,
  messages: [...(options.messages ?? []), ...diagnosticMessages(options.execution)],
  tool: options.tool,
  totals:
    options.totals ??
    ({
      reduceReduce: options.conflicts.filter((item) => item.kind === "reduce/reduce").length,
      shiftReduce: options.conflicts.filter((item) => item.kind === "shift/reduce").length,
    } as const),
  truncated: options.execution.truncated,
});

interface XmlReduction {
  readonly enabled: boolean;
  readonly rule: string;
  readonly symbol: string;
}

const xmlRules = (root: Readonly<Record<string, unknown>>): ReadonlyMap<string, string> => {
  const rules = nested(root, "grammar", "rules");
  const result = new Map<string, string>();
  asArray(rules?.rule).forEach((value) => {
    const item = asRecord(value);
    const number = asString(item?.number);
    const lhs = asString(item?.lhs);
    if (number !== undefined && lhs !== undefined) {
      result.set(number, lhs);
    }
  });
  return result;
};

const xmlTransitions = (
  state: Readonly<Record<string, unknown>>,
): readonly { readonly symbol: string; readonly type: string }[] => {
  const transitions = nested(state, "actions", "transitions");
  return asArray(transitions?.transition).flatMap((value) => {
    const item = asRecord(value);
    const symbol = asString(item?.symbol);
    const type = asString(item?.type);
    return symbol === undefined || type === undefined ? [] : [{ symbol, type }];
  });
};

const xmlReductions = (state: Readonly<Record<string, unknown>>): readonly XmlReduction[] => {
  const reductions = nested(state, "actions", "reductions");
  return asArray(reductions?.reduction).flatMap((value) => {
    const item = asRecord(value);
    const ruleNumber = asString(item?.rule);
    const symbol = asString(item?.symbol);
    if (ruleNumber === undefined || symbol === undefined || ruleNumber === "accept") {
      return [];
    }
    return [
      {
        enabled: asString(item?.enabled) !== "false",
        rule: ruleNumber,
        symbol,
      },
    ];
  });
};

const textFromUnknown = (value: unknown): string =>
  asArray(value)
    .flatMap((item) => {
      const direct = asString(item);
      if (direct !== undefined) {
        return [direct];
      }
      const record = asRecord(item);
      return record === undefined
        ? []
        : Object.values(record).map((nestedValue) => textFromUnknown(nestedValue));
    })
    .join("\n")
    .trim();

const xmlCounterexample = (state: Readonly<Record<string, unknown>>): string | undefined => {
  const value = state.counterexamples ?? state.counterexample;
  const text = textFromUnknown(value);
  return text.length === 0 ? undefined : text.slice(0, 2_000);
};

export const parseBisonXmlReport = (
  xml: string,
  execution: ToolExecution,
): ConflictReport | undefined => {
  if (xml.trim().length === 0 || /<!DOCTYPE/iu.test(xml)) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = new XMLParser({
      attributeNamePrefix: "",
      ignoreAttributes: false,
      parseAttributeValue: false,
      parseTagValue: false,
      processEntities: false,
      trimValues: true,
    }).parse(xml);
  } catch {
    return undefined;
  }
  const document = asRecord(parsed);
  const root = asRecord(document?.["bison-xml-report"]);
  const automaton = nested(root, "automaton");
  if (root === undefined || automaton === undefined) {
    return undefined;
  }

  const rules = xmlRules(root);
  const conflicts: GrammarConflict[] = [];
  asArray(automaton.state).forEach((value) => {
    const state = asRecord(value);
    if (state === undefined) {
      return;
    }
    const stateNumber = asNumber(state.number);
    const transitions = xmlTransitions(state).filter((item) => item.type === "shift");
    const reductions = xmlReductions(state);
    const symbols = new Set([
      ...transitions.map((item) => item.symbol),
      ...reductions.map((item) => item.symbol),
    ]);
    symbols.forEach((symbol) => {
      const shifts = transitions.filter((item) => item.symbol === symbol);
      const reduced = reductions.filter((item) => item.symbol === symbol);
      const ruleNames = reduced.flatMap((item) => {
        const name = rules.get(item.rule);
        return name === undefined ? [] : [name];
      });
      const counterexample = xmlCounterexample(state);
      if (shifts.length > 0 && reduced.length > 0) {
        conflicts.push(
          conflict({
            format: "bison-xml",
            kind: "shift/reduce",
            ruleNames,
            ...(counterexample === undefined ? {} : { counterexample }),
            ...(stateNumber === undefined ? {} : { state: stateNumber }),
            token: symbol,
          }),
        );
      }
      if (reduced.length > 1) {
        conflicts.push(
          conflict({
            format: "bison-xml",
            kind: "reduce/reduce",
            ruleNames,
            ...(counterexample === undefined ? {} : { counterexample }),
            ...(stateNumber === undefined ? {} : { state: stateNumber }),
            token: symbol,
          }),
        );
      }
    });
  });
  return report({
    conflicts,
    detail: "full",
    execution,
    format: "bison-xml",
    tool: "bison",
  });
};

interface StateSummary {
  readonly reduceReduce: number;
  readonly shiftReduce: number;
  readonly state: number;
}

const stateSummaries = (text: string): readonly StateSummary[] => {
  const summaries: StateSummary[] = [];
  const pattern =
    /^State\s+(\d+)\s+conflicts:\s*(?:(\d+)\s+shift\/reduce)?(?:\s*,?\s*)?(?:(\d+)\s+reduce\/reduce)?/gimu;
  for (const match of text.matchAll(pattern)) {
    const state = Number(match[1]);
    const shiftReduce = Number(match[2] ?? 0);
    const reduceReduce = Number(match[3] ?? 0);
    if (Number.isSafeInteger(state)) {
      summaries.push({ reduceReduce, shiftReduce, state });
    }
  }
  return summaries;
};

const stateSection = (text: string, state: number): string => {
  const pattern = new RegExp(`^State ${String(state)}\\s*$`, "imu");
  const start = pattern.exec(text)?.index;
  if (start === undefined) {
    return "";
  }
  const remainder = text.slice(start);
  const next = /\nState \d+\s*$/imu.exec(remainder.slice(1));
  return next === null ? remainder : remainder.slice(0, next.index + 1);
};

const ruleNamesFromSection = (section: string): readonly string[] => {
  const names: string[] = [];
  for (const match of section.matchAll(/reduce using rule \d+\s+\(([^)\r\n]+)\)/gimu)) {
    if (match[1] !== undefined) {
      names.push(match[1].trim());
    }
  }
  for (const match of section.matchAll(/^\s*\d+\s+([^\s:|]+)\s*:/gimu)) {
    if (match[1] !== undefined) {
      names.push(match[1].trim());
    }
  }
  return unique(names);
};

const counterexampleFromSection = (section: string): string | undefined => {
  const start = section.search(/^\s*(?:shift\/reduce|reduce\/reduce) conflict\b/imu);
  if (start < 0) {
    return undefined;
  }
  return section.slice(start).trim().slice(0, 2_000);
};

const totalsFromDiagnostics = (
  text: string,
): { readonly reduceReduce: number; readonly shiftReduce: number } | undefined => {
  let shiftReduce = 0;
  let reduceReduce = 0;
  for (const match of text.matchAll(/(\d+)\s+shift\/reduce conflicts?/gimu)) {
    shiftReduce = Math.max(shiftReduce, Number(match[1]));
  }
  for (const match of text.matchAll(/(\d+)\s+reduce\/reduce conflicts?/gimu)) {
    reduceReduce = Math.max(reduceReduce, Number(match[1]));
  }
  return shiftReduce === 0 && reduceReduce === 0 ? undefined : { reduceReduce, shiftReduce };
};

const countOnlyConflicts = (
  totals: { readonly reduceReduce: number; readonly shiftReduce: number },
  format: ReportFormat,
): readonly GrammarConflict[] => {
  const conflicts: GrammarConflict[] = [];
  if (totals.shiftReduce > 0) {
    conflicts.push(
      conflict({
        format,
        kind: "shift/reduce",
        ruleNames: [],
        token: "unmapped",
      }),
    );
  }
  if (totals.reduceReduce > 0) {
    conflicts.push(
      conflict({
        format,
        kind: "reduce/reduce",
        ruleNames: [],
        token: "unmapped",
      }),
    );
  }
  return conflicts;
};

const summarizedTotals = (
  summaries: readonly StateSummary[],
): { readonly reduceReduce: number; readonly shiftReduce: number } =>
  summaries.reduce(
    (totals, summary) => ({
      reduceReduce: totals.reduceReduce + summary.reduceReduce,
      shiftReduce: totals.shiftReduce + summary.shiftReduce,
    }),
    { reduceReduce: 0, shiftReduce: 0 },
  );

const appendStateConflicts = (
  conflicts: GrammarConflict[],
  options: {
    readonly count: number;
    readonly counterexample?: string;
    readonly format: ReportFormat;
    readonly kind: ConflictKind;
    readonly ruleNames: readonly string[];
    readonly state: number;
  },
): void => {
  const available = Math.max(0, MAX_CONFLICT_ENTRIES - conflicts.length);
  for (let index = 0; index < Math.min(options.count, available); index += 1) {
    conflicts.push(
      conflict({
        format: options.format,
        kind: options.kind,
        ruleNames: options.ruleNames,
        ...(options.counterexample === undefined ? {} : { counterexample: options.counterexample }),
        state: options.state,
        token: `conflict-${String(index + 1)}`,
      }),
    );
  }
};

export const parseTextReport = (
  reportText: string,
  execution: ToolExecution,
  tool: ToolKind,
): ConflictReport => {
  const format: ReportFormat = tool === "bison" ? "bison-text" : "lrama-text";
  const summaries = stateSummaries(reportText);
  if (summaries.length > 0) {
    const conflicts: GrammarConflict[] = [];
    const totals = summarizedTotals(summaries);
    summaries.forEach((summary) => {
      const section = stateSection(reportText, summary.state);
      const ruleNames = ruleNamesFromSection(section);
      const counterexample = counterexampleFromSection(section);
      appendStateConflicts(conflicts, {
        count: summary.shiftReduce,
        ...(counterexample === undefined ? {} : { counterexample }),
        format,
        kind: "shift/reduce",
        ruleNames,
        state: summary.state,
      });
      appendStateConflicts(conflicts, {
        count: summary.reduceReduce,
        ...(counterexample === undefined ? {} : { counterexample }),
        format,
        kind: "reduce/reduce",
        ruleNames,
        state: summary.state,
      });
    });
    const totalCount = totals.shiftReduce + totals.reduceReduce;
    return report({
      conflicts,
      detail: "full",
      execution,
      format,
      ...(totalCount > conflicts.length
        ? { messages: ["Conflict details exceeded the display limit and were truncated."] }
        : {}),
      tool,
      totals,
    });
  }

  const recognizedReport = /^\s*(?:Grammar|State \d+|state \d+)/imu.test(reportText);
  const diagnosticTotals = totalsFromDiagnostics(
    `${execution.stderr}\n${execution.stdout}\n${reportText}`,
  );
  if (diagnosticTotals !== undefined) {
    return report({
      conflicts: countOnlyConflicts(diagnosticTotals, format),
      detail: "counts-only",
      execution,
      format,
      messages: ["Detailed conflict locations were unavailable; showing totals only."],
      tool,
      totals: diagnosticTotals,
    });
  }
  if (recognizedReport && execution.code === 0) {
    return report({ conflicts: [], detail: "full", execution, format, tool });
  }
  return {
    conflicts: [],
    detail: "failed",
    format,
    messages: [
      "The parser-generator report could not be interpreted.",
      ...diagnosticMessages(execution),
    ],
    tool,
    totals: ZERO_TOTALS,
    truncated: execution.truncated,
  };
};
