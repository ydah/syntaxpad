/**
 * Adversarial regression tests for ydah/syntaxpad.
 * Reviewed commit: dc6ca8ff7fce2fc6d85c775af2ce5a007a40311b
 *
 * Place this file in packages/syntaxpad-core/src/ and run from the repository root:
 *   npx vitest run packages/syntaxpad-core/src/syntaxpad-adversarial-regressions.test.ts
 *
 * These assertions preserve the safe behavior expected from the reviewed regressions.
 * VS Code integration and external parser-generator execution are not covered here.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { scanEmbeddedCode } from "./embedded-code.js";
import { analyzeGrammar } from "./model.js";
import { parseGrammar } from "./parser.js";
import { renameSymbol } from "./rename.js";
import { extractRule, inlineRule, wrapSelection } from "./structural.js";

const rangeOf = (source: string, text: string): { start: number; end: number } => {
  const start = source.lastIndexOf(text);
  assert.ok(start >= 0, `Test selection is missing: ${text}`);
  return { start, end: start + text.length };
};

const previewOf = (result: ReturnType<typeof renameSymbol>): string => {
  assert.equal(result.ok, true, "A supported safe transformation should succeed");
  return result.plan.preview;
};

const typedRenameSource = `%union { int expr; }
%token <expr> A
%type <expr> start expr
%%
start: expr { $$ = $<expr>expr; };
expr: A;
%%`;

const typedIndexSource = `%union { int i64; }
%token A B C
%type <i64> start
%%
start: A B C { $$ = $<i64>3; };
%%`;

describe("adversarial source transformations", () => {
  it("F01: rename changes the named target, not a matching type tag", () => {
    const out = previewOf(renameSymbol(parseGrammar(typedRenameSource), "expr", "term"));
    assert.ok(out.includes("$<expr>term"), out);
    assert.ok(!out.includes("$<term>expr"), out);
  });

  it("F02: extract renumbers the suffix, not digits in the type tag", () => {
    const out = previewOf(
      extractRule(parseGrammar(typedIndexSource), rangeOf(typedIndexSource, "A B"), "prefix"),
    );
    assert.ok(out.includes("$<i64>2"), out);
    assert.ok(!out.includes("$<i2>3"), out);
  });

  it("F03: token rename also updates a %prec reference", () => {
    const source = "%token NUM\n%precedence UMINUS\n%%\ns: NUM %prec UMINUS;\n%%";
    const out = previewOf(renameSymbol(parseGrammar(source), "UMINUS", "NEG"));
    assert.ok(out.includes("%prec NEG"), out);
    assert.ok(!out.includes("UMINUS"), out);
  });

  it("F04: repeated inlining accounts for earlier expansions in the same RHS", () => {
    const source =
      "%token A B\n%start start\n%%\npair: A B { $$ = $2; };\nstart: pair pair { $$ = $1 + $2; };\n%%";
    const out = previewOf(inlineRule(parseGrammar(source), "pair", { confirmAction: true }));
    assert.ok(out.includes("A B { $$ = $2; } A B { $$ = $5; } { $$ = $3 + $6; }"), out);
  });

  it("F05: inline refuses or preserves definitions referenced in parameterized arguments", () => {
    const source = "%token A\n%%\nstart: item option(item);\nitem: A;\n%%";
    const result = inlineRule(parseGrammar(source, { dialect: "lrama" }), "item");
    if (!result.ok) return; // Conservative refusal is safe.
    const model = analyzeGrammar(parseGrammar(result.plan.preview, { dialect: "lrama" }));
    assert.deepEqual(
      model.references.filter((r) => r.kind === "undefined"),
      [],
      result.plan.preview,
    );
  });

  it("F06a: inline must not leave an explicit %start without a definition", () => {
    const source = "%token A\n%start start\n%%\nstart: A;\nother: start A;\n%%";
    const result = inlineRule(parseGrammar(source), "start");
    if (!result.ok) return;
    const model = analyzeGrammar(parseGrammar(result.plan.preview));
    assert.ok(model.startSymbol && model.definitions.has(model.startSymbol), result.plan.preview);
  });

  it("F06b: inline must not silently change the implicit start symbol", () => {
    const source = "%token A\n%%\nstart: A;\nother: start A;\n%%";
    const before = parseGrammar(source);
    const result = inlineRule(before, "start");
    if (!result.ok) return;
    const after = analyzeGrammar(parseGrammar(result.plan.preview));
    assert.equal(after.startSymbol, analyzeGrammar(before).startSymbol, result.plan.preview);
  });

  it("F07: extract must not move free parameters outside their declaring rule", () => {
    const source = "%token A\n%%\nstart: pair(A);\n%rule pair(X): X X;\n%%";
    const result = extractRule(
      parseGrammar(source, { dialect: "lrama" }),
      rangeOf(source, "X X"),
      "prefix",
    );
    if (!result.ok) return;
    const model = analyzeGrammar(parseGrammar(result.plan.preview, { dialect: "lrama" }));
    assert.deepEqual(
      model.references.filter((r) => r.kind === "undefined"),
      [],
      result.plan.preview,
    );
  });

  it("F08: wrap refuses a multi-symbol selection whose distinct values are referenced", () => {
    const source = "%token A B\n%%\nstart: A B { $$ = $1 + $2; };\n%%";
    const result = wrapSelection(
      parseGrammar(source, { dialect: "lrama" }),
      rangeOf(source, "A B"),
      "option",
      "pair",
    );
    assert.equal(result.ok, false, JSON.stringify(result));
  });

  it("F09: generated rule names must not collide with declared terminals", () => {
    const source = "%token A B\n%%\nstart: A B;\n%%";
    const result = extractRule(parseGrammar(source), rangeOf(source, "A B"), "A");
    assert.equal(result.ok, false, JSON.stringify(result));
  });

  it("F10b: rename must leave comments inside a parameterized call unchanged", () => {
    const source = "%token A\n%%\nstart: option(A /* A */);\n%%";
    const out = previewOf(renameSymbol(parseGrammar(source, { dialect: "lrama" }), "A", "B"));
    assert.ok(out.includes("option(B /* A */)"), out);
  });
});

describe("adversarial parsing and diagnostics", () => {
  it("F10a: comment words are not parameter arguments", () => {
    const source = "%token A\n%%\nstart: option(A /* phantom */);\n%%";
    const document = parseGrammar(source, { dialect: "lrama" });
    const item = document.rules[0]?.alternatives[0]?.items[0];
    assert.equal(item?.kind, "parameterized");
    if (item?.kind !== "parameterized") throw new Error("Missing parameterized item");
    assert.deepEqual(
      item.arguments.map((arg) => arg.name),
      ["A"],
    );
  });

  it("F10c: a closing parenthesis in a comment does not end a call", () => {
    const source = "%token A\n%%\nstart: option(A /* ) */);\n%%";
    const document = parseGrammar(source, { dialect: "lrama" });
    const items = document.rules[0]?.alternatives[0]?.items ?? [];
    assert.equal(items.length, 1, JSON.stringify(items));
    const item = items[0];
    assert.ok(item);
    assert.equal(source.slice(item.range.start, item.range.end), "option(A /* ) */)");
  });

  it("F11: a spliced // comment hides braces and references on the next physical line", () => {
    const source = "{\n// continued " + "\\" + "\n } $phantom\n $$ = $1;\n}";
    const scanned = scanEmbeddedCode(source, 0);
    assert.equal(scanned.end, source.length, JSON.stringify(scanned));
    assert.equal(scanned.terminated, true);
    assert.deepEqual(
      scanned.references.map((r) => r.target),
      [{ kind: "result" }, { index: 1, kind: "index" }],
    );
  });

  it("F12a: two rules on the same physical line must both be recognized", () => {
    const source = "%%\na: 'a'; b: 'b';\n%%";
    assert.deepEqual(
      parseGrammar(source).rules.map((r) => r.name),
      ["a", "b"],
    );
  });

  it("F12b: a leading comment on the same line must not hide a rule", () => {
    const source = "%%\n/* comment */ a: 'a';\n%%";
    assert.deepEqual(
      parseGrammar(source).rules.map((r) => r.name),
      ["a"],
    );
  });

  it("F13: the built-in error token does not need a %token declaration", () => {
    const source = "%token A\n%%\nstart: A | error;\n%%";
    const diagnostics = analyzeGrammar(parseGrammar(source)).diagnostics;
    assert.deepEqual(
      diagnostics.filter((d) => d.code === "undefined-symbol"),
      [],
    );
  });

  it("F14: an implicit named LHS reference resolves to the result", () => {
    const source = "%token A\n%%\nstart: A { $start = $1; };\n%%";
    const diagnostics = analyzeGrammar(parseGrammar(source)).diagnostics;
    assert.deepEqual(
      diagnostics.filter((d) => d.code === "action-name-not-found"),
      [],
    );
  });
});
