import { analyzeGrammar, parseGrammar } from "@syntaxpad/core";
import type { RuleNode } from "@syntaxpad/core";
import { describe, expect, it } from "vitest";

import { createDependencyGraph } from "./dependency.js";
import { renderDependencySvg } from "./dependency-svg.js";
import { createRailroadView, detectRecursion } from "./railroad-model.js";
import { renderRailroadSvg } from "./railroad-svg.js";

const ruleNamed = (source: string, name: string): RuleNode => {
  const rule = parseGrammar(source, { dialect: "lrama" }).rules.find(
    (candidate) => candidate.name === name,
  );
  if (rule === undefined) {
    throw new Error(`Missing rule ${name}`);
  }
  return rule;
};

describe("recursion folding", () => {
  it("folds an optional left-recursive list", () => {
    const rule = ruleNamed(
      `%%
list:
  %empty
| list item
;
%%`,
      "list",
    );

    expect(detectRecursion(rule)).toMatchObject({
      direction: "left",
      item: [{ label: "item" }],
      optional: true,
      separator: [],
    });
  });

  it("folds a separated non-empty right-recursive list", () => {
    const rule = ruleNamed(
      `%%
items:
  item
| item ',' items
;
%%`,
      "items",
    );

    expect(detectRecursion(rule)).toMatchObject({
      direction: "right",
      item: [{ label: "item" }],
      optional: false,
      separator: [{ label: "','" }],
    });
  });

  it("does not fold an action-bearing recursion", () => {
    const rule = ruleNamed(
      `%%
list:
  item
| list item { $$ = $1; }
;
%%`,
      "list",
    );

    expect(detectRecursion(rule)).toBeUndefined();
  });
});

describe("railroad SVG", () => {
  it("renders ranged keyboard-focusable elements and a visible folding badge", () => {
    const rule = ruleNamed(
      `%%
list:
  %empty
| list item
;
%%`,
      "list",
    );
    const rendered = renderRailroadSvg(createRailroadView(rule));

    expect(rendered.folded).toBe(true);
    expect(rendered.svg).toContain("Folded recursion");
    expect(rendered.svg).toContain('tabindex="0"');
    expect(rendered.svg).toContain("data-start=");
  });

  it("uses conventional compact labels for Lrama standard rules", () => {
    const rule = ruleNamed(
      `%%
start:
  option(item) separated_nonempty_list(',', item)
;
%%`,
      "start",
    );
    const view = createRailroadView(rule, { foldRecursion: false });

    expect(view.lanes[0]?.elements.map((element) => element.label)).toEqual([
      "[item]?",
      "{item}+", // Literal separators are intentionally omitted from the compact argument labels.
    ]);
  });

  it("marks a conflicted rule visibly and accessibly", () => {
    const rule = ruleNamed(
      `%%
expression: expression '+' expression | NUMBER ;
%%`,
      "expression",
    );
    const rendered = renderRailroadSvg(createRailroadView(rule, { conflict: true }));

    expect(rendered.conflict).toBe(true);
    expect(rendered.svg).toContain("railroad-conflict-badge");
    expect(rendered.svg).toContain("parser conflict");
  });
});

describe("dependency graph", () => {
  const source = `%token TOKEN
%start root
%%
root: branch missing ;
branch: leaf ;
leaf: TOKEN ;
unused: TOKEN ;
%%`;

  it("defaults to a bounded neighborhood with explicit undefined status", () => {
    const document = parseGrammar(source);
    const model = analyzeGrammar(document);
    const view = createDependencyGraph(document, model, {
      distance: 1,
      selected: "root",
    });

    expect(view.mode).toBe("neighborhood");
    expect(view.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(["root", "branch", "missing"]),
    );
    expect(view.nodes.find((node) => node.id === "missing")?.statuses).toContain("undefined");
    expect(view.nodes.find((node) => node.id === "missing")?.kind).toBe("undefined");
    expect(view.nodes.some((node) => node.id === "unused")).toBe(false);
  });

  it("renders accessible nodes and status text", () => {
    const document = parseGrammar(source);
    const view = createDependencyGraph(document, analyzeGrammar(document), {
      mode: "all",
    });
    const rendered = renderDependencySvg(view);

    expect(rendered.svg).toContain('role="button"');
    expect(rendered.svg).toContain('data-symbol="missing"');
    expect(rendered.svg).toContain("undefined");
    expect(rendered.svg).toContain("marker-end=");
  });

  it("marks conflict rules independently of other diagnostics", () => {
    const document = parseGrammar(source);
    const view = createDependencyGraph(document, analyzeGrammar(document), {
      conflictRules: new Set(["branch"]),
      mode: "all",
    });

    expect(view.nodes.find((node) => node.id === "branch")?.statuses).toContain("conflict");
    expect(renderDependencySvg(view).svg).toContain("status-conflict");
  });

  it("expands a terminal search to every rule that uses the token", () => {
    const document = parseGrammar(source);
    const view = createDependencyGraph(document, analyzeGrammar(document), {
      mode: "all",
      query: "TOKEN",
    });

    expect(view.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(["TOKEN", "leaf", "unused"]),
    );
    expect(view.nodes.find((node) => node.id === "TOKEN")?.kind).toBe("terminal");
    const rendered = renderDependencySvg(view).svg;
    expect(rendered).toContain("kind-terminal");
    expect(rendered).toContain("data-degree=");
  });
});
