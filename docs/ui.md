# UI specification

## Panel

```text
┌ SyntaxPad ──────────────────────────────────────────────────────────┐
│ [Rule ▾] [Search…               ] [Neighborhood 1 ▾] [Raw/Folded] │
├─────────────────────────────┬──────────────────────────────────────┤
│ Railroad                    │ Dependencies                         │
│ expression                  │         primary                     │
│ ○─ term ─┬─ "+" ─ term ─○ │           ↓                         │
│          └─ "−" ─ term ─┘ │ expression → term → factor          │
│ [Folded recursion]          │ statuses: ! conflict, ? undefined  │
├─────────────────────────────┴──────────────────────────────────────┤
│ 3 references · reachable · yacc profile          [Run conflicts] │
└────────────────────────────────────────────────────────────────────┘
```

At widths below 700 px the panes stack vertically. The panel uses VS Code theme variables, IBM Plex
Sans-compatible system UI for labels, and the editor monospace font for grammar symbols. No remote
font or image is loaded.

## Behavior

- Opening the panel selects the cursor's rule, else the start rule, else the first parsed rule.
- Cursor follow is enabled by default and can be toggled without changing the document.
- Click/Enter/Space on a diagram symbol navigates to its source. A reference opens VS Code's
  references UI when multiple destinations exist.
- `Raw/Folded` is a pressed toggle with text, not color alone. Folded diagrams display a permanent
  badge.
- Graph node selection updates the railroad rule and editor selection. Whole graph is behind an
  explicit menu choice and warns above 1,000 nodes.
- Errors use `role="status"`/`aria-live="polite"` and retain the last valid view.

## Commands

| Command               | Surface                      | Proposed key         |
| --------------------- | ---------------------------- | -------------------- |
| Open Grammar View     | palette/editor title         | none                 |
| Rename Symbol         | LSP/context menu             | F2                   |
| Extract Rule          | palette/refactor menu        | none                 |
| Inline Rule           | palette/refactor menu        | none                 |
| Reorder Alternatives  | Webview drag buttons/palette | Alt+Up/Down in panel |
| Wrap in option/list   | refactor menu                | none                 |
| Add Alternative       | refactor menu                | none                 |
| Run Conflict Analysis | palette/panel                | none                 |
| Toggle Action Folding | palette                      | none                 |

Webview alternative reordering has keyboard-accessible up/down buttons. Dragging is an enhancement,
never the only path.

## Accessibility and motion

- Interactive targets are at least 32 px in desktop VS Code and have a visible 2 px `:focus-visible`
  outline.
- Text contrast uses VS Code foreground/background variables; status shapes and labels accompany
  color.
- SVG groups expose `role="button"` and accessible names; the same graph data is available as a
  navigable node list.
- Transitions are limited to 150 ms opacity/color. `prefers-reduced-motion: reduce` disables them.
- Diagram pan/zoom never traps keyboard focus. `0` resets zoom, arrow keys move among diagram items.

## Message protocol

Messages are discriminated, runtime-validated objects:

- Host to view: `model`, `selection`, `conflicts`, `error`, `theme`.
- View to host: `ready`, `navigate`, `selectRule`, `setNeighborhood`, `toggleFold`,
  `reorderAlternative`, `runConflicts`.

Every model includes a document URI and version. Stale view mutations are rejected.
