import { describe, expect, it } from "vitest";

import { scanEmbeddedCode } from "./embedded-code.js";

describe("scanEmbeddedCode", () => {
  it("ignores braces and references in C lexical islands", () => {
    const source = String.raw`{
      char a = '{';
      char b = '}';
      const char *s = "{ $ignored }";
      const char *r = R"tag({ @ignored })tag";
      /* } $ignored */
      // { @ignored
#define BLOCK { \
        }
      if (ok) { $$ = $<node>2; @$ = @name; }
    } trailing`;

    const scanned = scanEmbeddedCode(source, 0);

    expect(scanned.terminated).toBe(true);
    expect(source.slice(scanned.end)).toBe(" trailing");
    expect(
      scanned.references.map((reference) => ({
        kind: reference.kind,
        target: reference.target,
        typeTag: reference.typeTag,
      })),
    ).toEqual([
      { kind: "value", target: { kind: "result" }, typeTag: undefined },
      {
        kind: "value",
        target: { index: 2, kind: "index" },
        typeTag: "node",
      },
      { kind: "location", target: { kind: "result" }, typeTag: undefined },
      {
        kind: "location",
        target: { kind: "name", name: "name" },
        typeTag: undefined,
      },
    ]);
  });

  it("marks an unterminated action unsafe without throwing", () => {
    const scanned = scanEmbeddedCode("{ if (x) { $$ = $1; }", 0);

    expect(scanned.terminated).toBe(false);
    expect(scanned.safe).toBe(false);
    expect(scanned.references).toHaveLength(2);
  });

  it("extracts bracketed and typed reference forms", () => {
    const source = "{ $[left] @right @[place] $<value>$ @<loc>3; }";
    const scanned = scanEmbeddedCode(source, 0);

    expect(scanned.references.map((reference) => reference.target)).toEqual([
      { kind: "name", name: "left" },
      { kind: "name", name: "right" },
      { kind: "name", name: "place" },
      { kind: "result" },
      { index: 3, kind: "index" },
    ]);
    expect(scanned.references.map((reference) => reference.typeTag)).toEqual([
      undefined,
      undefined,
      undefined,
      "value",
      "loc",
    ]);
  });
});
