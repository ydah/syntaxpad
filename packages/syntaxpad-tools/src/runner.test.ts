import { describe, expect, it } from "vitest";

import { describeConflictInvocations } from "./runner.js";

describe("conflict invocation descriptions", () => {
  it("shows Bison XML first and a text fallback without composing a shell command", () => {
    const invocations = describeConflictInvocations({
      additionalArguments: ["--warnings"],
      executable: "/opt/tools/bison",
      tool: "bison",
    });

    expect(invocations).toHaveLength(3);
    expect(invocations[0]?.executable).toBe("/opt/tools/bison");
    expect(invocations[0]?.args).toContainEqual(
      expect.stringContaining("--xml=<temporary-directory>"),
    );
    expect(invocations[1]?.args).toContain("--report=state,lookahead,solved");
    expect(invocations[1]?.args).not.toContain("-Wcounterexamples");
    expect(invocations[2]?.args).toContain("--verbose");
    expect(invocations.flatMap((invocation) => invocation.args)).toContain("--warnings");
  });

  it("uses Lrama's report file interface", () => {
    const invocation = describeConflictInvocations({
      executable: "lrama",
      tool: "lrama",
    })[0];

    expect(invocation?.args).toContain("--report=states,lookaheads,counterexamples");
    expect(invocation?.args).toContainEqual(
      expect.stringContaining("--report-file=<temporary-directory>"),
    );
  });
});
