import { z } from "zod";

const graphModeSchema = z.enum(["all", "neighborhood", "reachable"]);

export const viewMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ready") }),
  z.strictObject({
    end: z.number().int().nonnegative(),
    preferDefinition: z.boolean(),
    start: z.number().int().nonnegative(),
    startedAt: z.number().nonnegative().optional(),
    type: z.literal("navigate"),
    uri: z.string(),
  }),
  z.strictObject({
    symbol: z.string(),
    type: z.literal("selectRule"),
  }),
  z.strictObject({
    folded: z.boolean(),
    type: z.literal("toggleFold"),
  }),
  z.strictObject({
    distance: z.number().int().min(0).max(5),
    mode: graphModeSchema,
    type: z.literal("setGraph"),
  }),
  z.strictObject({
    query: z.string().max(200),
    type: z.literal("search"),
  }),
  z.strictObject({ type: z.literal("runConflicts") }),
  z.strictObject({
    from: z.number().int().nonnegative(),
    ruleId: z.string(),
    to: z.number().int().nonnegative(),
    type: z.literal("moveAlternative"),
  }),
  z.strictObject({
    durationMs: z.number().nonnegative().max(60_000),
    kind: z.literal("cursor-highlight"),
    type: z.literal("performance"),
  }),
]);

const ruleOptionSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
});

const conflictReportSchema = z.strictObject({
  conflicts: z.array(
    z.strictObject({
      counterexample: z.string().optional(),
      id: z.string(),
      kind: z.enum(["reduce/reduce", "shift/reduce"]),
      message: z.string(),
      ruleNames: z.array(z.string()),
      state: z.number().int().nonnegative().optional(),
      targets: z.array(
        z.strictObject({
          end: z.number().int().nonnegative(),
          ruleName: z.string(),
          start: z.number().int().nonnegative(),
        }),
      ),
      token: z.string().optional(),
    }),
  ),
  detail: z.enum(["counts-only", "failed", "full"]),
  format: z.enum(["bison-text", "bison-xml", "lrama-text", "none"]),
  messages: z.array(z.string()),
  tool: z.enum(["bison", "lrama"]),
  totals: z.strictObject({
    reduceReduce: z.number().int().nonnegative(),
    shiftReduce: z.number().int().nonnegative(),
  }),
  truncated: z.boolean(),
});

export const grammarViewModelSchema = z.strictObject({
  alternatives: z.array(
    z.strictObject({
      index: z.number().int().nonnegative(),
      label: z.string(),
    }),
  ),
  conflictReport: conflictReportSchema.optional(),
  dependencySvg: z.string(),
  diagnostics: z.number().int().nonnegative(),
  distance: z.number().int().nonnegative(),
  folded: z.boolean(),
  foldingEnabled: z.boolean(),
  graphMode: graphModeSchema,
  references: z.number().int().nonnegative(),
  railroadSvg: z.string(),
  ruleCount: z.number().int().nonnegative(),
  rules: z.array(ruleOptionSchema),
  selectedRuleId: z.string(),
  selectedRuleName: z.string(),
  truncated: z.boolean(),
  uri: z.string(),
  version: z.number().int(),
});

export const hostMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    model: grammarViewModelSchema,
    sentAt: z.number().nonnegative().optional(),
    type: z.literal("model"),
  }),
  z.strictObject({
    offset: z.number().int().nonnegative(),
    sentAt: z.number().nonnegative().optional(),
    type: z.literal("selection"),
  }),
  z.strictObject({
    message: z.string(),
    type: z.literal("error"),
  }),
]);

export type GrammarViewModel = z.infer<typeof grammarViewModelSchema>;
export type HostMessage = z.infer<typeof hostMessageSchema>;
export type ViewMessage = z.infer<typeof viewMessageSchema>;
