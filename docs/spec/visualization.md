# Visualization and grammar view

`@syntaxpad/viz` converts core grammar documents and semantic models into source-ranged railroad and
dependency view models, then renders self-contained SVG strings. It has no VS Code or DOM
dependency. The extension host builds the combined grammar-view model, while the Webview owns the
controls and interaction handling.

## Railroad diagram

Each grammar alternative is a lane. Terminals use rounded shapes, other symbols use rectangular
shapes, actions use a compact `{...}` marker, and precedence and unknown items remain visible.
Parameterized Lrama references use compact optional or repetition labels for recognized standard
rules and retain their source range.

Every rendered element carries the core source range used for editor navigation. Parser conflicts
add a labelled badge and conflict styling to an affected rule.

### Recursion folding

Folding is deliberately conservative. A rule must have exactly two alternatives and a direct left-
or right-recursive alternative. The other alternative must establish either the empty base or the
repeated item sequence. These shapes can represent optional, non-empty, and separated lists.

An action, precedence annotation, unknown item, or parameterized reference in either candidate shape
disables folding. The raw alternatives remain in the view model, and the toolbar toggle can request
raw rendering. A folded rendering always displays a **Folded recursion** badge and labels the loop
direction and cardinality.

## Dependency graph

The graph contains defined nonterminals and their indexed edges. Undefined references are included
as nodes. Terminals stay out of the ordinary graph and are added when a non-empty search matches
them, together with every rule that uses the matching token.

The available modes are:

- **Neighborhood:** an undirected breadth-first neighborhood around the selected rule, bounded by
  the selected distance.
- **Reachable:** every node reachable through directed grammar dependencies from the selected rule.
- **Whole graph:** all known graph nodes.

A non-empty search overrides the mode's normal node selection. It matches node names
case-insensitively and includes incident neighbors. Selection is capped at 1,000 nodes; truncation
is reported in the panel. Dagre lays out only the filtered graph.

Nodes expose nonterminal, terminal, or undefined kind; degree; distance from the start symbol when
known; and conflict, unused, unreachable, or undefined status. Text labels and SVG attributes
supplement color and shape styling.

## Panel and interactions

The grammar view opens beside the editor and follows the active `.y`, `.yy`, or `yacc` language
document. Its parsed document and semantic model are cached by URI and version. Document edits
schedule a debounced reparse. Moving into another rule redraws the selected railroad and graph;
moving within the same rule sends a lighter selection update.

The toolbar provides rule selection, search, dependency mode and distance, recursion folding, and
conflict analysis. The main area contains Railroad, Dependencies, and Conflicts panes. At narrow
widths the railroad and dependency panes stack. A status footer reports current rule, reference,
diagnostic, and conflict counts while retaining the last valid diagrams when an error message is
shown.

Current direct interactions are:

- click, Enter, or Space on a ranged railroad element to reveal its source; a nonterminal reference
  prefers its first indexed definition;
- click, Enter, or Space on a dependency node to select its rule and, when a source range exists,
  reveal that range;
- choose a rule, graph mode, distance, or folded/raw state from the toolbar;
- search after a short input debounce;
- reorder alternatives by drag and drop or by the labelled **Move up** and **Move down** buttons;
- run conflict analysis and navigate with a conflict's **Go to** button; and
- expand a conflict counterexample with native details/summary controls when one is available.

The extension manifest is the source of truth for the complete
[command and setting contributions](../../packages/syntaxpad-vscode/package.json). This document
does not assign proposed keybindings.

## Message protocol

Both directions are strict, runtime-validated discriminated unions in
[`protocol.ts`](../../packages/syntaxpad-vscode/src/protocol.ts). Unknown properties or invalid
values are rejected.

Host-to-view messages are:

- `model`: a versioned grammar view model and optional send timestamp;
- `selection`: an offset in the current document and optional send timestamp; and
- `error`: a user-facing status message.

View-to-host messages are:

- `ready`, `navigate`, `selectRule`, and `toggleFold`;
- `setGraph` and `search`;
- `runConflicts` and `moveAlternative`; and
- `performance` for the measured cursor-highlight duration.

The model identifies its document URI and version. Conflict reports are shown only when their URI
and version match the current cached grammar. Incoming view messages are schema-validated before the
host dispatches them.

## Accessibility and presentation

The panel uses VS Code theme variables and editor fonts, has visible focus outlines, and exposes a
polite live status region. Statuses have text labels rather than relying on color. Toolbar controls
have accessible labels, alternative reordering has a button path, and reduced-motion preferences
disable the SVG hover transitions. No remote fonts or images are loaded.

Railroad elements and dependency nodes are focusable SVG groups with accessible names and
`role="button"`; the SVG roots use `role="img"`. The Webview handles Enter and Space in addition to
pointer activation.

## Performance measurement

Cursor and navigation timings are written to the local **SyntaxPad Metrics** output channel. The
required thresholds live in the [performance budgets](../quality/budgets.md). The cursor-highlight
acknowledgement is currently posted after selection classes or replacement SVG markup have been
applied to the DOM. It is not synchronized with `requestAnimationFrame` and therefore does not prove
that a browser paint has completed.

## Current limitations

- Cursor following is always enabled; the panel has no follow-selection toggle.
- Diagram activation opens a single source or first definition. It does not open VS Code's
  references UI for multiple destinations.
- The diagrams have scroll overflow but no pan/zoom controls, arrow-key item navigation, or separate
  navigable node list.
- Action markers cannot be expanded or hidden independently.
- Assistive-technology behavior of focusable button groups nested inside an SVG with `role="img"`
  has not been verified across supported screen readers.
- A model redraw replaces both SVG trees and alternative controls, so keyboard focus inside those
  regions is not preserved.
