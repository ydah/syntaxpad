import { describe, expect, it } from "vitest";

import { applyTextPatches, InvalidPatchError } from "./patches.js";

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
});
