import { z } from "zod";

const conflictCommandArgumentSchema = z.strictObject({
  uri: z.string().min(1).max(4_096),
});

export interface ConflictCommandArgument {
  readonly uri: string;
}

export type ConflictCommandTarget =
  | { readonly kind: "active-editor" }
  | { readonly kind: "document"; readonly uri: string }
  | { readonly kind: "invalid" };

export const createConflictCommandArgument = (
  uri: string | undefined,
): ConflictCommandArgument | undefined =>
  uri === undefined || uri.length === 0
    ? undefined
    : {
        uri,
      };

export const parseConflictCommandTarget = (input: unknown): ConflictCommandTarget => {
  if (input === undefined) {
    return { kind: "active-editor" };
  }
  const parsed = conflictCommandArgumentSchema.safeParse(input);
  return parsed.success
    ? { kind: "document", uri: parsed.data.uri }
    : {
        kind: "invalid",
      };
};
