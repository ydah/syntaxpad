import { describe, expect, it } from "vitest";

import {
  createSnapshot,
  getCompletions,
  getDefinitionRanges,
  getHover,
  getReferenceRanges,
  renameAtOffset,
  symbolAtOffset,
} from "./language-service.js";

const source = `%token <number> NUMBER
%type <number> expression
%start expression
%%
expression:
  NUMBER
| expression[left] '+' NUMBER { $$ = $left + $3; }
;
unused:
  NUMBER { $$ = $2; }
;
%%`;

describe("language service", () => {
  const snapshot = createSnapshot(source, "bison");

  it("offers profile directives and indexed symbols", () => {
    const declarationCompletions = getCompletions(snapshot, source.indexOf("%token"));
    const ruleCompletions = getCompletions(snapshot, source.indexOf("NUMBER\n|"));

    expect(declarationCompletions.some((item) => item.label === "%token")).toBe(true);
    expect(ruleCompletions.some((item) => item.label === "expression")).toBe(true);
    expect(ruleCompletions.some((item) => item.label === "NUMBER")).toBe(true);
  });

  it("resolves symbol definitions and references", () => {
    const referenceOffset = source.indexOf("expression[left]");
    const symbol = symbolAtOffset(snapshot, referenceOffset + 2);

    expect(symbol?.name).toBe("expression");
    expect(
      getDefinitionRanges(snapshot, referenceOffset).map((range) =>
        source.slice(range.start, range.end),
      ),
    ).toEqual(["expression"]);
    expect(getReferenceRanges(snapshot, referenceOffset, true).length).toBeGreaterThan(1);
  });

  it("shows declaration and reference information in hover", () => {
    const hover = getHover(snapshot, source.indexOf("expression:"));

    expect(hover?.markdown).toContain("nonterminal");
    expect(hover?.markdown).toContain("%type");
    expect(hover?.markdown).toContain("reference(s)");
  });

  it("renames action references through the core patch planner", () => {
    const offset = source.indexOf("expression[left]");
    const result = renameAtOffset(snapshot, offset, "expr");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.preview).toContain("expr[left]");
    expect(result.plan.preview).not.toContain("%type <number> expression");
  });

  it("includes action-reference diagnostics", () => {
    expect(snapshot.model.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "action-index-out-of-range",
    );
  });
});
