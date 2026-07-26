import { describe, expect, it } from "vitest";

import { createConflictCommandArgument, parseConflictCommandTarget } from "./conflict-command.js";

describe("conflict command target", () => {
  it("uses the active editor when the command palette supplies no target", () => {
    expect(parseConflictCommandTarget(undefined)).toEqual({ kind: "active-editor" });
  });

  it("preserves the grammar URI supplied by the Webview host", () => {
    const argument = createConflictCommandArgument("file:///workspace/grammar.y");

    expect(argument).toEqual({ uri: "file:///workspace/grammar.y" });
    expect(parseConflictCommandTarget(argument)).toEqual({
      kind: "document",
      uri: "file:///workspace/grammar.y",
    });
  });

  it("rejects malformed command arguments", () => {
    expect(parseConflictCommandTarget({ uri: "" })).toEqual({ kind: "invalid" });
    expect(parseConflictCommandTarget({ extra: true, uri: "file:///grammar.y" })).toEqual({
      kind: "invalid",
    });
  });
});
