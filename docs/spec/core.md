# Grammar core

`@syntaxpad/core` parses a decoded JavaScript string into lossless ranged nodes, derives grammar
semantics, and plans source patches without depending on Node.js, VS Code, the DOM, or a renderer.

## Grammar surface

A document contains declarations, the first `%%`, rules, an optional second `%%`, and an epilogue.
The section scanner ignores delimiters encountered in recognized comments, quoted literals, actions,
and `%{...%}` blocks.

Known Yacc/Bison directives include `%token`, `%nterm`, `%type`, `%start`, `%left`, `%right`,
`%nonassoc`, `%precedence`, `%union`, `%code`, `%define`, `%param`, `%parse-param`, `%lex-param`,
`%destructor`, `%printer`, `%expect`, `%expect-rr`, `%locations`, `%empty`, and `%prec`. A dialect
profile decides which declarations are known; unknown directives become opaque declarations.

Lrama support follows its [parser grammar](https://github.com/ruby/lrama/blob/master/parser.y) and
[standard library](https://github.com/ruby/lrama/blob/master/lib/lrama/grammar/stdlib.y). The parser
recognizes `%rule name(P, Q)`, `%rule %inline name(P)`, `%inline`, nested parameterized calls, and
the Lrama event directives in the dialect profile.

### Lrama standard rules

This is SyntaxPad's canonical standard-rule list. These names are treated as built-ins during
semantic analysis and have compact visualization behavior:

- `option`
- `ioption`
- `list`
- `nonempty_list`
- `separated_list`
- `separated_nonempty_list`
- `preceded`
- `terminated`
- `delimited`

Action references are ranged and classified for `$$`, `$n`, `$name`, `$[name]`, `@$`, `@n`, `@name`,
and `@[name]`. Typed Bison forms such as `$<tag>n` and `$<tag>$` retain the tag and classify the
suffix. Labels on RHS symbols, literals, and midrule actions participate in named-reference
resolution. Unbracketed action references stop before C member-access punctuation.

## CST and semantic model

All ranges use JavaScript UTF-16 code-unit offsets to match VS Code and LSP positions. The input
string is stored once in `GrammarDocument.source`; nodes point into it. `printGrammar` returns that
same string rather than reconstructing the grammar.

`GrammarDocument` records sections, declarations, rules, alternatives, source ranges, newline style,
dialect, diagnostics, and opaque ranges. Alternative items distinguish symbols, literals,
parameterized calls, actions, `%prec`, `%empty`, and unknown text. Trivia stays between item ranges
in the source.

`analyzeGrammar` derives definitions, symbol and action references, terminals, dependency edges, the
start symbol, unused/unreachable rules, and diagnostics. The model recognizes that a symbol was
declared by a precedence directive, but it does not build an ordered precedence-level table.

## Embedded-code scanner

The scanner is a deterministic state machine over normal code, nested braces, quoted literals with
escapes and line splices, C/C++ comments, C++ raw strings, and preprocessor lines with continued
lines. Only normal-code state changes brace depth or recognizes `$`/`@` references. Each reference
contains its sigil class, target, optional type tag, and absolute range. An unterminated or
uncertain action is marked unsafe for structural transformations.

## Editing pipeline

1. Resolve the request against the current CST and ranges.
2. Validate the selected rule/items and build a transformation plan without mutating the source.
3. Rewrite supported named or positional action references.
4. Reject known unsafe actions, boundary-crossing references, invalid names, ambiguous definitions,
   and overlapping patches.
5. Infer indentation, alternative markers, colon, and semicolon layout from nearby rules.
6. Apply sorted, half-open patches from the end of the source toward the start.
7. Reparse the preview and check a transform-specific structural postcondition.

The core currently provides rename, add/reorder alternative, extract, inline, and option/list wrap
plans. The extension turns a successful plan into one `WorkspaceEdit`, preserving editor undo.
Extract, Inline, and Wrap recommend a subsequent parser-generator conflict check.

## Current limitations

- `parseGrammar` accepts an already-decoded JavaScript string. `encoding` records only whether that
  string begins with a BOM (`utf8-bom` versus `utf8`); it does not preserve or decode arbitrary
  original byte encodings.
- The Lrama shorthand `item?` is not parsed as a parameterized standard-rule call.
- A missing rule semicolon consumes the remaining rules section; recovery does not synchronize at
  the next line-start rule header.
- Section scanning has lexical awareness for `%{...%}`, but declaration parsing and prologue folding
  still use simple `%}` searches. A `%}` inside a prologue literal or comment can therefore close
  those secondary scans early.
- The semantic model identifies symbols declared by `%left`, `%right`, `%nonassoc`, and
  `%precedence`, but does not expose precedence levels or associativity as an ordered table.
- Rename validates spelling and rewrites known occurrences, but does not reject a new name that
  collides with an existing declaration or rule.
- Multiple-symbol Wrap and repeated Inline occurrences in the same caller have known positional
  action-reference renumbering defects. Do not use those transform cases until the defects are
  fixed; reparsing or running the parser generator does not prove that semantic-value references
  still refer to the intended positions.
