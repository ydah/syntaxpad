import { analyzeGrammar, parseGrammar } from "@syntaxpad/core";
import type { ConflictReport } from "@syntaxpad/tools";
import { describe, expect, it } from "vitest";

import { grammarViewModelSchema } from "./protocol.js";
import { createGrammarViewModel } from "./view-model.js";

describe("createGrammarViewModel", () => {
  it("creates a runtime-valid bounded view payload", () => {
    const document = parseGrammar(`%token TOKEN
%%
root: list ;
list: %empty | list TOKEN ;
unused: TOKEN ;
%%`);
    const view = createGrammarViewModel({
      document,
      model: analyzeGrammar(document),
      state: {
        distance: 1,
        foldRecursion: true,
        graphMode: "neighborhood",
        query: "",
        selectedRuleName: "list",
      },
      uri: "file:///grammar.y",
      version: 3,
    });

    expect(view).toBeDefined();
    expect(grammarViewModelSchema.safeParse(view).success).toBe(true);
    expect(view?.railroadSvg).toContain("Folded recursion");
    expect(view?.dependencySvg).toContain("syntaxpad-dependency");
    expect(view?.query).toBe("");
    expect(view?.selectedRuleName).toBe("list");
  });

  it("exposes search state and expands a cleared neighborhood by distance", () => {
    const document = parseGrammar(`%token TOKEN
%%
root: branch ;
branch: leaf ;
leaf: TOKEN ;
other: TOKEN ;
%%`);
    const model = analyzeGrammar(document);
    const createView = (
      query: string,
      distance: number,
    ): ReturnType<typeof createGrammarViewModel> =>
      createGrammarViewModel({
        document,
        model,
        state: {
          distance,
          foldRecursion: true,
          graphMode: "neighborhood",
          query,
          selectedRuleName: "leaf",
        },
        uri: "file:///grammar.y",
        version: 1,
      });

    const searchResults = createView("TOKEN", 2);
    const distanceOne = createView("", 1);
    const distanceTwo = createView("", 2);

    expect(searchResults?.query).toBe("TOKEN");
    expect(distanceOne?.dependencySvg).not.toContain('data-symbol="root"');
    expect(distanceTwo?.dependencySvg).toContain('data-symbol="root"');
  });

  it("maps normalized conflicts to navigable graph and railroad targets", () => {
    const document = parseGrammar(`%token NUMBER
%%
expression: expression '+' expression | NUMBER ;
%%`);
    const conflictReport: ConflictReport = {
      conflicts: [
        {
          id: "bison-xml:5:shift/reduce:'+'",
          kind: "shift/reduce",
          message: "shift/reduce conflict in state 5",
          ruleNames: ["expression"],
          state: 5,
        },
      ],
      detail: "full",
      format: "bison-xml",
      messages: [],
      tool: "bison",
      totals: { reduceReduce: 0, shiftReduce: 1 },
      truncated: false,
    };
    const view = createGrammarViewModel({
      document,
      model: analyzeGrammar(document),
      state: {
        conflictReport,
        distance: 1,
        foldRecursion: true,
        graphMode: "neighborhood",
        query: "",
        selectedRuleName: "expression",
      },
      uri: "file:///grammar.y",
      version: 1,
    });

    expect(view?.railroadSvg).toContain("railroad-conflict-badge");
    expect(view?.dependencySvg).toContain("status-conflict");
    expect(view?.conflictReport?.conflicts[0]?.targets[0]?.ruleName).toBe("expression");
  });
});
