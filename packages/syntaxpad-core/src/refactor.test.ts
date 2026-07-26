import { describe, expect, it } from "vitest";

import { addAlternative, reorderAlternatives } from "./alternatives.js";
import { parseGrammar } from "./parser.js";
import { renameSymbol } from "./rename.js";
import { extractRule, inlineRule, wrapSelection } from "./structural.js";

const rangeOf = (
  source: string,
  text: string,
): { readonly end: number; readonly start: number } => {
  const start = source.lastIndexOf(text);
  if (start < 0) {
    throw new Error(`Missing test text: ${text}`);
  }
  return { end: start + text.length, start };
};

describe("renameSymbol", () => {
  it("renames definitions, declarations, RHS references, and named action references only", () => {
    const source = `%token OLD
%type <node> old_rule
%%
old_rule:
  OLD[value] { $$ = $value; const char *s = "$old_rule"; /* $old_rule */ }
;
start:
  old_rule[old_rule] { $$ = $old_rule; @$ = @[old_rule]; }
;
%%`;
    const result = renameSymbol(parseGrammar(source), "old_rule", "new_rule");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.preview).toContain("%type <node> new_rule");
    expect(result.plan.preview).toContain("new_rule:");
    expect(result.plan.preview).toContain("new_rule[new_rule]");
    expect(result.plan.preview).toContain("$new_rule");
    expect(result.plan.preview).toContain("@[new_rule]");
    expect(result.plan.preview).toContain('"$old_rule"');
    expect(result.plan.preview).toContain("/* $old_rule */");
  });
});

describe("alternative transforms", () => {
  it("adds and reorders alternatives while retaining the surrounding style", () => {
    const source = `%%
rule:
    A
  | B
  ;
%%`;
    const added = addAlternative(parseGrammar(source), "rule");
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    expect(added.plan.preview).toContain("| /* TODO */");

    const reordered = reorderAlternatives(parseGrammar(source), "rule", 1, 0);
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) {
      return;
    }
    expect(reordered.plan.preview.indexOf("B")).toBeLessThan(reordered.plan.preview.indexOf("A"));
  });
});

describe("structural transforms", () => {
  it("extracts a sequence and renumbers following positional references", () => {
    const source = `%token A B C
%%
start:
  A B C { $$ = $3; }
;
%%`;
    const result = extractRule(parseGrammar(source), rangeOf(source, "A B"), "prefix");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.preview).toContain("prefix C { $$ = $2; }");
    expect(result.plan.preview).toContain("prefix:");
    expect(result.plan.preview).toContain("A B");
    expect(result.plan.conflictCheckRecommended).toBe(true);
  });

  it("rejects extraction when an action reference crosses the boundary", () => {
    const source = `%token A B C
%%
start:
  A B C { $$ = $1; }
;
%%`;
    const result = extractRule(parseGrammar(source), rangeOf(source, "A B"), "prefix");

    expect(result).toMatchObject({
      error: { code: "cross-boundary-index-reference" },
      ok: false,
    });
  });

  it("wraps one Lrama symbol and renumbers collapsed positions", () => {
    const source = `%token A B
%%
start:
  A B { $$ = $1 + $2; }
;
%%`;
    const result = wrapSelection(
      parseGrammar(source, { dialect: "lrama" }),
      rangeOf(source, "A B"),
      "option",
      "pair",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.preview).toContain("option(pair) { $$ = $1 + $1; }");
    expect(result.plan.preview).toContain("pair:");
  });

  it("inlines a simple action rule after explicit confirmation", () => {
    const source = `%token A B C
%%
pair:
  A B { $$ = $2; }
;
start:
  pair C { $$ = $1; }
;
%%`;
    const pending = inlineRule(parseGrammar(source), "pair");
    expect(pending).toMatchObject({
      error: { code: "inline-action-confirmation-required" },
      ok: false,
    });

    const result = inlineRule(parseGrammar(source), "pair", { confirmAction: true });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.preview).toContain("A B { $$ = $2; } C { $$ = $3; }");
    expect(result.plan.preview).not.toContain("pair:");
  });
});
