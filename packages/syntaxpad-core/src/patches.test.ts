import { describe, expect, it } from "vitest";

import { parseGrammar } from "./parser.js";
import { applyTextPatches, finalizeTransform, InvalidPatchError } from "./patches.js";

describe("applyTextPatches", () => {
  it("applies replacements from the end without shifting earlier ranges", () => {
    expect(
      applyTextPatches("abcdef", [
        { range: { end: 2, start: 1 }, text: "B" },
        { range: { end: 5, start: 4 }, text: "E" },
      ]),
    ).toBe("aBcdEf");
  });

  it("keeps same-offset insertions in sequence order", () => {
    expect(
      applyTextPatches("x", [
        { range: { end: 0, start: 0 }, sequence: 0, text: "a" },
        { range: { end: 0, start: 0 }, sequence: 1, text: "b" },
      ]),
    ).toBe("abx");
  });

  it("rejects overlapping patches", () => {
    expect(() =>
      applyTextPatches("abcdef", [
        { range: { end: 3, start: 1 }, text: "" },
        { range: { end: 4, start: 2 }, text: "" },
      ]),
    ).toThrow(InvalidPatchError);
  });

  it("rejects new semantic errors even when the error count is unchanged", () => {
    const source = "%token A\n%%\nstart: missing;\nother: A;\n%%";
    const oldReference = source.indexOf("missing");
    const newReference = source.lastIndexOf("A");
    const result = finalizeTransform({
      document: parseGrammar(source),
      patches: [
        { range: { end: oldReference + 7, start: oldReference }, text: "A" },
        { range: { end: newReference + 1, start: newReference }, text: "missing" },
      ],
    });

    expect(result).toMatchObject({
      error: { code: "postcondition-analysis-error" },
      ok: false,
    });
  });

  it("rejects new unknown regions and implicit start symbol changes", () => {
    const source = "%token A\n%%\nstart: A;\nother: A;\n%%";
    const document = parseGrammar(source);
    const secondSection = source.lastIndexOf("%%");
    const unknown = finalizeTransform({
      document,
      patches: [{ range: { end: secondSection, start: secondSection }, text: "?" }],
    });
    const startRule = document.rules[0];
    expect(startRule).toBeDefined();
    if (startRule === undefined) {
      return;
    }
    const changedStart = finalizeTransform({
      document,
      patches: [{ range: startRule.range, text: "" }],
    });

    expect(unknown).toMatchObject({
      error: { code: "postcondition-unknown-region" },
      ok: false,
    });
    expect(changedStart).toMatchObject({
      error: { code: "postcondition-start-symbol-changed" },
      ok: false,
    });
  });
});
