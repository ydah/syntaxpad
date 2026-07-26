import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { analyzeGrammar } from "./model.js";
import { parseGrammar } from "./parser.js";

const RULE_COUNT = 3_500;
const ITERATIONS = 10;
const generatedSource = [
  "%token ITEM",
  "%start rule_0",
  "%%",
  ...Array.from(
    { length: RULE_COUNT },
    (_, index) =>
      `rule_${String(index)}:\n  ITEM${index + 1 < RULE_COUNT ? ` rule_${String(index + 1)}` : ""} { $$ = $1; }\n;`,
  ),
  "%%",
  "",
].join("\n");

interface BenchmarkResult {
  readonly budgetMs: number;
  readonly lines: number;
  readonly medianMs: number;
  readonly name: string;
  readonly p95Ms: number;
}

const measure = (name: string, source: string): BenchmarkResult => {
  const samples = Array.from({ length: ITERATIONS }, () => {
    const start = performance.now();
    analyzeGrammar(parseGrammar(source, { dialect: name === "cruby-parse.y" ? "lrama" : "bison" }));
    return performance.now() - start;
  }).sort((left, right) => left - right);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
  const median = samples[Math.floor(samples.length / 2)] ?? Number.POSITIVE_INFINITY;
  return {
    budgetMs: 300,
    lines: source.split("\n").length,
    medianMs: Number(median.toFixed(2)),
    name,
    p95Ms: Number(p95.toFixed(2)),
  };
};

const results = [measure("generated-10000-lines", generatedSource)];
const corpusPath = fileURLToPath(
  new URL("../../../fixtures/external/cruby-parse.y", import.meta.url),
);
if (existsSync(corpusPath)) {
  results.push(measure("cruby-parse.y", readFileSync(corpusPath, "utf8")));
}

console.log(JSON.stringify(results, undefined, 2));
if (results.some((result) => result.p95Ms > 1_000)) {
  process.exitCode = 1;
}
