import type { CompletionCandidate, Dialect } from "./types.js";

export interface DialectProfile {
  readonly directives: ReadonlySet<string>;
  readonly id: Dialect;
  readonly parameterizedRules: boolean;
  readonly standardRules: ReadonlySet<string>;
}

const YACC_DIRECTIVES = [
  "%left",
  "%nonassoc",
  "%right",
  "%start",
  "%token",
  "%type",
  "%union",
] as const;

const BISON_DIRECTIVES = [
  ...YACC_DIRECTIVES,
  "%code",
  "%define",
  "%destructor",
  "%empty",
  "%expect",
  "%expect-rr",
  "%initial-action",
  "%lex-param",
  "%locations",
  "%nterm",
  "%param",
  "%parse-param",
  "%precedence",
  "%printer",
] as const;

const LRAMA_DIRECTIVES = [
  ...BISON_DIRECTIVES,
  "%after-pop-stack",
  "%after-reduce",
  "%after-shift",
  "%after-shift-error-token",
  "%before-reduce",
  "%error-token",
  "%inline",
  "%no-stdlib",
  "%rule",
] as const;

const LRAMA_STANDARD_RULES = [
  "delimited",
  "ioption",
  "list",
  "nonempty_list",
  "option",
  "preceded",
  "separated_list",
  "separated_nonempty_list",
  "terminated",
] as const;

const profiles = {
  bison: {
    directives: new Set(BISON_DIRECTIVES),
    id: "bison",
    parameterizedRules: false,
    standardRules: new Set<string>(),
  },
  lrama: {
    directives: new Set(LRAMA_DIRECTIVES),
    id: "lrama",
    parameterizedRules: true,
    standardRules: new Set(LRAMA_STANDARD_RULES),
  },
  yacc: {
    directives: new Set(YACC_DIRECTIVES),
    id: "yacc",
    parameterizedRules: false,
    standardRules: new Set<string>(),
  },
} as const satisfies Record<Dialect, DialectProfile>;

export const getDialectProfile = (dialect: Dialect): DialectProfile => profiles[dialect];

export const getDirectiveCompletions = (dialect: Dialect): readonly CompletionCandidate[] =>
  [...getDialectProfile(dialect).directives]
    .sort((left, right) => left.localeCompare(right))
    .map((label) => ({
      detail: `${dialect} directive`,
      kind: "directive",
      label,
    }));
