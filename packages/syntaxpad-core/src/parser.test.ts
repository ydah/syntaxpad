import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { analyzeGrammar } from "./model.js";
import { parseGrammar, printGrammar } from "./parser.js";

const fixture = async (relativePath: string): Promise<string> => {
  const url = new URL(`../../../fixtures/${relativePath}`, import.meta.url);
  return readFile(fileURLToPath(url), "utf8");
};

describe("parseGrammar", () => {
  it("round-trips a grammar byte-for-byte and retains unknown directives", async () => {
    const source = await fixture("small/calculator.y");
    const document = parseGrammar(source, { dialect: "bison" });

    expect(printGrammar(document)).toBe(source);
    expect(document.rules.map((rule) => rule.name)).toEqual([
      "input",
      "expression",
      "term",
      "unused",
    ]);
    expect(document.rules[1]?.alternatives).toHaveLength(3);
    expect(document.declarations.find((node) => node.directive === "%mystery")?.known).toBe(false);
    expect(document.sections.map((section) => section.kind)).toEqual([
      "declarations",
      "rules",
      "epilogue",
    ]);
  });

  it("preserves BOM and CRLF", () => {
    const source = "\uFEFF%token A\r\n%%\r\nstart:\r\n  A\r\n;\r\n%%\r\n";
    const document = parseGrammar(source);

    expect(document.encoding).toBe("utf8-bom");
    expect(document.newline).toBe("\r\n");
    expect(printGrammar(document)).toBe(source);
  });

  it("parses the embedded-code torture fixture without losing the action boundary", async () => {
    const source = await fixture("small/embedded-code-torture.y");
    const document = parseGrammar(source);
    const action = document.rules[0]?.alternatives[0]?.items.find((item) => item.kind === "action");

    expect(action?.kind).toBe("action");
    if (action?.kind !== "action") {
      return;
    }
    expect(action.terminated).toBe(true);
    expect(action.references.map((reference) => reference.target)).toEqual([
      { kind: "result" },
      { index: 1, kind: "index" },
      { kind: "result" },
      { index: 1, kind: "index" },
    ]);
    expect(printGrammar(document)).toBe(source);
  });

  it("parses Lrama parameterized rule definitions", () => {
    const source = `%%
%rule %inline option(X)
  : %empty
  | X
  ;
%%`;
    const rule = parseGrammar(source, { dialect: "lrama" }).rules[0];

    expect(rule).toMatchObject({
      inline: true,
      name: "option",
      parameterized: true,
      parameterNames: [{ name: "X" }],
    });
  });

  it("parses typed Lrama rules before the rules-section delimiter", () => {
    const source = `%{
const char *not_a_rule = "%rule hidden(value): value;";
%}
%token ITEM
%rule wrapped(value) <node>
  : value { $$ = $value; }
  ;
%%
start: wrapped(ITEM);
%%`;
    const document = parseGrammar(source, { dialect: "lrama" });
    const model = analyzeGrammar(document);

    expect(document.rules.map((rule) => rule.name)).toEqual(["start", "wrapped"]);
    expect(document.rules[1]).toMatchObject({
      parameterNames: [{ name: "value" }],
      typeTag: "node",
    });
    expect(model.startSymbol).toBe("start");
    expect(model.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("recognizes aliases and type tags on literals and midrule actions", () => {
    const source = `%token ITEM
%%
start: '!'[not] { $$ = $not; }[saved]<node> item { $$ = $saved; };
item: ITEM;
%%`;
    const document = parseGrammar(source, { dialect: "lrama" });
    const model = analyzeGrammar(document);

    expect(document.rules[0]?.alternatives[0]?.items.map((item) => item.kind)).toEqual([
      "literal",
      "action",
      "symbol",
      "action",
    ]);
    expect(model.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("allows a parameterized rule and its concrete instantiation to share a name", () => {
    const source = `%token ITEM
%rule list(value) <node>: value | list(value) value { $$ = $list; };
%%
start: list;
list: list(ITEM);
%%`;
    const model = analyzeGrammar(parseGrammar(source, { dialect: "lrama" }));

    expect(model.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("round-trips the ambiguous conflict-analysis fixture", async () => {
    const source = await fixture("small/ambiguous.y");

    expect(printGrammar(parseGrammar(source))).toBe(source);
  });

  it("recovers after an unterminated action at a rule semicolon", () => {
    const source = `%token A B
%%
broken:
  A { if (x) { $$ = $1;
;
healthy:
  B
;
%%
`;
    const document = parseGrammar(source);

    expect(document.rules.map((rule) => rule.name)).toEqual(["broken", "healthy"]);
    expect(document.diagnostics.some((entry) => entry.code === "unterminated-action")).toBe(true);
    expect(printGrammar(document)).toBe(source);
  });

  it("handles arbitrary damaged text without changing it", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (fragment) => {
        const source = `%token A\n%%\nstart: A { "${fragment}" } ;\n%%\n${fragment}`;
        expect(printGrammar(parseGrammar(source))).toBe(source);
      }),
      { numRuns: 100 },
    );
  });
});

describe("analyzeGrammar", () => {
  it("derives dependencies and structural diagnostics", async () => {
    const document = parseGrammar(await fixture("small/calculator.y"), {
      dialect: "bison",
    });
    const model = analyzeGrammar(document);

    expect(model.startSymbol).toBe("input");
    expect(model.edges.map((edge) => `${edge.from}->${edge.to}`)).toEqual(
      expect.arrayContaining(["input->expression", "expression->term"]),
    );
    expect(model.unusedRules.has("unused")).toBe(true);
    expect(model.unreachableRules.has("unused")).toBe(true);
    expect(model.diagnostics.some((entry) => entry.code === "undefined-symbol")).toBe(false);
    expect(model.diagnostics.some((entry) => entry.code === "action-name-not-found")).toBe(false);
  });

  it("reports invalid positional and named action references", () => {
    const document = parseGrammar(`%token A
%%
start:
  A[label] { $$ = $2; @$ = @missing; }
;
%%`);
    const codes = analyzeGrammar(document).diagnostics.map((diagnostic) => diagnostic.code);

    expect(codes).toContain("action-index-out-of-range");
    expect(codes).toContain("action-name-not-found");
  });

  it("reports missing %type only for a typed non-Yacc profile", () => {
    const source = `%type <node> start
%%
start: other ;
other: %empty { $$ = 0; };
%%`;

    expect(
      analyzeGrammar(parseGrammar(source, { dialect: "bison" })).diagnostics.map(
        (diagnostic) => diagnostic.code,
      ),
    ).toContain("missing-type-declaration");
    expect(
      analyzeGrammar(parseGrammar(source, { dialect: "yacc" })).diagnostics.map(
        (diagnostic) => diagnostic.code,
      ),
    ).not.toContain("missing-type-declaration");
  });

  it("keeps the medium viewer fixture valid in the default profile", async () => {
    const document = parseGrammar(await fixture("medium/sql-subset.y"));
    const model = analyzeGrammar(document);

    expect(model.diagnostics).toEqual([]);
    expect(
      model.edges.some((edge) => edge.from === "select_list" && edge.to === "select_items"),
    ).toBe(true);
  });

  it("understands Lrama parameterized standard rules", () => {
    const document = parseGrammar(
      `%token COMMA ITEM
%%
start:
  separated_nonempty_list(COMMA, item)
;
item:
  ITEM
;
%%`,
      { dialect: "lrama" },
    );
    const model = analyzeGrammar(document);

    expect(model.diagnostics.some((entry) => entry.message.includes("separated_nonempty"))).toBe(
      false,
    );
    expect(model.edges.some((edge) => edge.from === "start" && edge.to === "item")).toBe(true);
  });
});
