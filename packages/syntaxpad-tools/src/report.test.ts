import { describe, expect, it } from "vitest";

import { parseBisonXmlReport, parseTextReport } from "./report.js";
import type { ToolExecution } from "./types.js";

const execution = (overrides: Partial<ToolExecution> = {}): ToolExecution => ({
  aborted: false,
  code: 0,
  invocation: { args: [], executable: "parser-generator" },
  signal: null,
  stderr: "",
  stdout: "",
  timedOut: false,
  truncated: false,
  ...overrides,
});

describe("Bison XML reports", () => {
  it("maps shift/reduce and reduce/reduce conflicts to grammar rules", () => {
    const xml = `<?xml version="1.0"?>
<bison-xml-report>
  <grammar>
    <rules>
      <rule number="1"><lhs>expression</lhs><rhs><symbol>expression</symbol></rhs></rule>
      <rule number="2"><lhs>term</lhs><rhs><symbol>NUMBER</symbol></rhs></rule>
    </rules>
  </grammar>
  <automaton>
    <state number="5">
      <actions>
        <transitions><transition type="shift" symbol="'+'" state="4"/></transitions>
        <reductions>
          <reduction symbol="'+'" rule="1" enabled="false"/>
          <reduction symbol="'+'" rule="2" enabled="true"/>
        </reductions>
      </actions>
    </state>
  </automaton>
</bison-xml-report>`;
    const report = parseBisonXmlReport(xml, execution());

    expect(report).toMatchObject({
      detail: "full",
      format: "bison-xml",
      totals: { reduceReduce: 1, shiftReduce: 1 },
    });
    expect(report?.conflicts[0]?.ruleNames).toEqual(["expression", "term"]);
    expect(report?.conflicts[0]?.state).toBe(5);
  });

  it("rejects unrecognized or DTD-bearing XML so the caller can fall back", () => {
    expect(parseBisonXmlReport("<other/>", execution())).toBeUndefined();
    expect(
      parseBisonXmlReport("<!DOCTYPE report><bison-xml-report/>", execution()),
    ).toBeUndefined();
  });
});

describe("text reports", () => {
  it("parses Lrama state details and counterexamples", () => {
    const text = `State 5 conflicts: 1 shift/reduce

Grammar

    1 expression: expression '+' expression

State 5

    1 expression: expression • '+' expression
    1           | expression '+' expression •

    '+' reduce using rule 1 (expression)

    shift/reduce conflict on token '+':
      Shift derivation
        expression • '+' expression
      Reduce derivation
        expression '+' expression •
`;
    const report = parseTextReport(text, execution(), "lrama");

    expect(report).toMatchObject({
      detail: "full",
      format: "lrama-text",
      totals: { reduceReduce: 0, shiftReduce: 1 },
    });
    expect(report.conflicts[0]?.ruleNames).toContain("expression");
    expect(report.conflicts[0]?.counterexample).toContain("Shift derivation");
  });

  it("degrades to aggregate counts when state details are unavailable", () => {
    const report = parseTextReport(
      "",
      execution({ stderr: "grammar.y: warning: 2 shift/reduce conflicts" }),
      "bison",
    );

    expect(report.detail).toBe("counts-only");
    expect(report.totals.shiftReduce).toBe(2);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts.every((item) => item.ruleNames.length === 0)).toBe(true);
  });

  it("bounds detailed entries while retaining reported totals", () => {
    const report = parseTextReport(
      "State 7 conflicts: 1000000 shift/reduce\n\nState 7\n\n  1 root: root item",
      execution(),
      "lrama",
    );

    expect(report.conflicts).toHaveLength(1_000);
    expect(report.totals.shiftReduce).toBe(1_000_000);
    expect(report.messages.join(" ")).toContain("display limit");
  });

  it("returns a failed report instead of throwing on unknown output", () => {
    const report = parseTextReport(
      "not a parser report",
      execution({ code: 1, stderr: "unsupported option" }),
      "bison",
    );

    expect(report.detail).toBe("failed");
    expect(report.messages.join(" ")).toContain("could not be interpreted");
  });
});
