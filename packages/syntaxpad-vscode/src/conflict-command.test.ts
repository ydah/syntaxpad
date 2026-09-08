import { describe, expect, it } from "vitest";

import {
  createConflictCommandArgument,
  isCurrentConflictRequest,
  parseConflictCommandTarget,
} from "./conflict-command.js";

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

  it("rejects stale or superseded conflict results", () => {
    const request = { id: 2, version: 5 };

    expect(isCurrentConflictRequest(request, request)).toBe(true);
    expect(isCurrentConflictRequest(request, { id: undefined, version: 5 })).toBe(false);
    expect(isCurrentConflictRequest(request, { id: 2, version: 6 })).toBe(false);
    expect(isCurrentConflictRequest(request, { id: 3, version: 5 })).toBe(false);
  });
});
