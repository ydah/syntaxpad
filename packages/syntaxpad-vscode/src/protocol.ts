import { z } from "zod";

const graphModeSchema = z.enum(["all", "neighborhood", "reachable"]);

export const viewMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ready") }),
  z.strictObject({
    end: z.number().int().nonnegative(),
    preferDefinition: z.boolean(),
    start: z.number().int().nonnegative(),
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
]);

const ruleOptionSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
});

export const grammarViewModelSchema = z.strictObject({
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
    type: z.literal("model"),
  }),
  z.strictObject({
    offset: z.number().int().nonnegative(),
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
