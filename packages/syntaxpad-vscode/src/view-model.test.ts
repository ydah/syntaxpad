import { analyzeGrammar, parseGrammar } from "@syntaxpad/core";
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
    expect(view?.selectedRuleName).toBe("list");
  });
});
