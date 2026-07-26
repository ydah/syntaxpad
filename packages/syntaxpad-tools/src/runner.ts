import { spawn } from "node:child_process";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseBisonXmlReport, parseTextReport } from "./report.js";
import type { ConflictReport, ConflictRunRequest, ToolExecution, ToolInvocation } from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_OUTPUT_LIMIT = 1_048_576;

const invocationArgs = (
  tool: ConflictRunRequest["tool"],
  format: "primary" | "text" | "xml-basic",
  temporaryDirectory: string,
  additionalArguments: readonly string[],
): readonly string[] => {
  const input = join(temporaryDirectory, "input.y");
  const output = join(temporaryDirectory, "parser.c");
  if (tool === "lrama") {
    return [
      ...additionalArguments,
      "--report=states,lookaheads,counterexamples",
      `--report-file=${join(temporaryDirectory, "report.output")}`,
      `--output=${output}`,
      input,
    ];
  }
  if (format === "primary" || format === "xml-basic") {
    return [
      ...additionalArguments,
      `--xml=${join(temporaryDirectory, "report.xml")}`,
      `--report=state,lookahead,solved${format === "primary" ? ",counterexamples" : ""}`,
      ...(format === "primary" ? ["-Wcounterexamples"] : []),
      `--output=${output}`,
      input,
    ];
  }
  return [...additionalArguments, "--verbose", `--output=${output}`, input];
};

export const describeConflictInvocations = (
  request: Pick<ConflictRunRequest, "additionalArguments" | "executable" | "tool">,
): readonly ToolInvocation[] => {
  const directory = "<temporary-directory>";
  const additionalArguments = request.additionalArguments ?? [];
  const primary = {
    args: invocationArgs(request.tool, "primary", directory, additionalArguments),
    executable: request.executable,
  };
  if (request.tool === "lrama") {
    return [primary];
  }
  return [
    primary,
    {
      args: invocationArgs("bison", "xml-basic", directory, additionalArguments),
      executable: request.executable,
    },
    {
      args: invocationArgs("bison", "text", directory, additionalArguments),
      executable: request.executable,
    },
  ];
};

interface Capture {
  readonly append: (chunk: Buffer | string) => void;
  readonly text: () => string;
  readonly truncated: () => boolean;
}

const createCapture = (limit: number): Capture => {
  const chunks: Buffer[] = [];
  let bytes = 0;
  let wasTruncated = false;
  return {
    append: (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = Math.max(0, limit - bytes);
      if (buffer.byteLength > remaining) {
        wasTruncated = true;
      }
      if (remaining > 0) {
        const captured = buffer.subarray(0, remaining);
        chunks.push(captured);
        bytes += captured.byteLength;
      }
    },
    text: () => Buffer.concat(chunks).toString("utf8"),
    truncated: () => wasTruncated,
  };
};

const execute = async (options: {
  readonly cwd: string;
  readonly invocation: ToolInvocation;
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
}): Promise<ToolExecution> =>
  new Promise((resolve) => {
    const stdout = createCapture(options.maxOutputBytes);
    const stderr = createCapture(options.maxOutputBytes);
    let aborted = options.signal?.aborted ?? false;
    let error: string | undefined;
    let finished = false;
    let timedOut = false;
    const child = spawn(options.invocation.executable, options.invocation.args, {
      cwd: options.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const finish = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      resolve({
        aborted,
        code,
        ...(error === undefined ? {} : { error }),
        invocation: options.invocation,
        signal,
        stderr: stderr.text(),
        stdout: stdout.text(),
        timedOut,
        truncated: stdout.truncated() || stderr.truncated(),
      });
    };
    const abort = (): void => {
      aborted = true;
      child.kill();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout.append(chunk);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr.append(chunk);
    });
    child.on("error", (cause) => {
      error = cause.message;
    });
    child.on("close", finish);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (aborted) {
      abort();
    }
  });

const readReport = async (
  path: string,
  maxBytes: number,
): Promise<{ readonly text: string; readonly truncated: boolean }> => {
  try {
    const handle = await open(path, "r");
    try {
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
      const stats = await handle.stat();
      return {
        text: buffer.subarray(0, bytesRead).toString("utf8"),
        truncated: stats.size > bytesRead,
      };
    } finally {
      await handle.close();
    }
  } catch {
    return { text: "", truncated: false };
  }
};

const withReportTruncation = (execution: ToolExecution, truncated: boolean): ToolExecution =>
  truncated && !execution.truncated ? { ...execution, truncated: true } : execution;

const appendMessages = (report: ConflictReport, messages: readonly string[]): ConflictReport =>
  messages.length === 0 ? report : { ...report, messages: [...report.messages, ...messages] };

const removeGeneratedReport = async (path: string): Promise<void> => {
  await rm(path, { force: true }).catch(() => undefined);
};

const isAborted = (signal: AbortSignal | undefined): boolean => signal?.aborted ?? false;

const mergeCounterexamples = (
  structured: ConflictReport,
  text: ConflictReport,
): ConflictReport => ({
  ...structured,
  conflicts: structured.conflicts.map((item) => {
    const supplement = text.conflicts.find(
      (candidate) =>
        candidate.kind === item.kind &&
        candidate.state === item.state &&
        candidate.counterexample !== undefined,
    );
    return supplement?.counterexample === undefined
      ? item
      : { ...item, counterexample: supplement.counterexample };
  }),
});

export const runConflictAnalysis = async (request: ConflictRunRequest): Promise<ConflictReport> => {
  let temporaryDirectory: string | undefined;
  const additionalArguments = request.additionalArguments ?? [];
  const maxOutputBytes = Math.max(4_096, request.maxOutputBytes ?? DEFAULT_OUTPUT_LIMIT);
  const timeoutMs = Math.max(100, request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "syntaxpad-"));
    await writeFile(join(temporaryDirectory, "input.y"), request.source, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    const primaryInvocation: ToolInvocation = {
      args: invocationArgs(request.tool, "primary", temporaryDirectory, additionalArguments),
      executable: request.executable,
    };
    const primary = await execute({
      cwd: temporaryDirectory,
      invocation: primaryInvocation,
      maxOutputBytes,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      timeoutMs,
    });
    if (request.tool === "lrama") {
      const reportFile = await readReport(
        join(temporaryDirectory, "report.output"),
        maxOutputBytes,
      );
      return parseTextReport(
        reportFile.text,
        withReportTruncation(primary, reportFile.truncated),
        "lrama",
      );
    }

    const xml = await readReport(join(temporaryDirectory, "report.xml"), maxOutputBytes);
    const xmlReport = parseBisonXmlReport(xml.text, withReportTruncation(primary, xml.truncated));
    if (xmlReport !== undefined) {
      const text = await readReport(join(temporaryDirectory, "parser.output"), maxOutputBytes);
      return mergeCounterexamples(
        xmlReport,
        parseTextReport(text.text, withReportTruncation(primary, text.truncated), "bison"),
      );
    }
    if (primary.aborted || primary.timedOut || isAborted(request.signal)) {
      return parseTextReport("", primary, "bison");
    }

    await removeGeneratedReport(join(temporaryDirectory, "report.xml"));
    await removeGeneratedReport(join(temporaryDirectory, "parser.output"));
    const basicXmlInvocation: ToolInvocation = {
      args: invocationArgs("bison", "xml-basic", temporaryDirectory, additionalArguments),
      executable: request.executable,
    };
    const basicXml = await execute({
      cwd: temporaryDirectory,
      invocation: basicXmlInvocation,
      maxOutputBytes,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      timeoutMs,
    });
    const basicXmlFile = await readReport(join(temporaryDirectory, "report.xml"), maxOutputBytes);
    const basicXmlReport = parseBisonXmlReport(
      basicXmlFile.text,
      withReportTruncation(basicXml, basicXmlFile.truncated),
    );
    if (basicXmlReport !== undefined) {
      return appendMessages(basicXmlReport, [
        "Bison counterexamples were unavailable; the compatible XML report was used.",
      ]);
    }
    if (basicXml.aborted || basicXml.timedOut || isAborted(request.signal)) {
      return parseTextReport("", basicXml, "bison");
    }

    await removeGeneratedReport(join(temporaryDirectory, "parser.output"));
    const fallbackInvocation: ToolInvocation = {
      args: invocationArgs("bison", "text", temporaryDirectory, additionalArguments),
      executable: request.executable,
    };
    const fallback = await execute({
      cwd: temporaryDirectory,
      invocation: fallbackInvocation,
      maxOutputBytes,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      timeoutMs,
    });
    const text = await readReport(join(temporaryDirectory, "parser.output"), maxOutputBytes);
    return appendMessages(
      parseTextReport(text.text, withReportTruncation(fallback, text.truncated), "bison"),
      ["Bison XML was unavailable; the text report adapter was used."],
    );
  } catch (cause) {
    return {
      conflicts: [],
      detail: "failed",
      format: "none",
      messages: [cause instanceof Error ? cause.message : "Conflict analysis failed."],
      tool: request.tool,
      totals: { reduceReduce: 0, shiftReduce: 0 },
      truncated: false,
    };
  } finally {
    if (temporaryDirectory !== undefined) {
      await rm(temporaryDirectory, { force: true, recursive: true }).catch(() => undefined);
    }
  }
};
