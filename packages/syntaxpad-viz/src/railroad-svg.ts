import type { FoldedRecursion, RailroadElement, RailroadView, SvgRender } from "./types.js";

const ELEMENT_HEIGHT = 32;
const HORIZONTAL_GAP = 28;
const LANE_GAP = 56;
const PADDING = 24;

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const elementWidth = (element: RailroadElement): number =>
  Math.max(46, Math.min(260, element.label.length * 8 + 24));

const elementClass = (element: RailroadElement): string => `railroad-${element.kind}`;

const renderElement = (
  element: RailroadElement,
  x: number,
  y: number,
): { readonly markup: string; readonly width: number } => {
  const width = elementWidth(element);
  const label = escapeXml(element.label);
  const range = `data-start="${String(element.range.start)}" data-end="${String(element.range.end)}"`;
  const accessible = `role="button" tabindex="0" aria-label="${escapeXml(`${element.kind} ${element.label}`)}"`;
  const shape =
    element.kind === "action"
      ? `<path d="M ${String(x + 8)} ${String(y)} L ${String(x + width)} ${String(y)} L ${String(x + width - 8)} ${String(y + ELEMENT_HEIGHT)} L ${String(x)} ${String(y + ELEMENT_HEIGHT)} Z"/>`
      : `<rect x="${String(x)}" y="${String(y)}" width="${String(width)}" height="${String(ELEMENT_HEIGHT)}" rx="${element.kind === "terminal" ? "16" : "5"}"/>`;
  return {
    markup: `<g class="railroad-element ${elementClass(element)}" ${range} ${accessible}>${shape}<text x="${String(x + width / 2)}" y="${String(y + 21)}" text-anchor="middle">${label}</text></g>`,
    width,
  };
};

const laneWidth = (elements: readonly RailroadElement[]): number =>
  elements.reduce((width, element) => width + elementWidth(element) + HORIZONTAL_GAP, 0) + 40;

const renderLane = (
  elements: readonly RailroadElement[],
  y: number,
  totalWidth: number,
): string => {
  if (elements.length === 0) {
    return `<path class="railroad-track" d="M ${String(PADDING)} ${String(y + ELEMENT_HEIGHT / 2)} H ${String(totalWidth - PADDING)}"/><text class="railroad-empty-label" x="${String(totalWidth / 2)}" y="${String(y + 20)}" text-anchor="middle">ε</text>`;
  }

  const contentWidth = laneWidth(elements);
  let x = Math.max(PADDING + 20, (totalWidth - contentWidth) / 2);
  const centerY = y + ELEMENT_HEIGHT / 2;
  const markup = [
    `<path class="railroad-track" d="M ${String(PADDING)} ${String(centerY)} H ${String(x)}"/>`,
  ];
  elements.forEach((element) => {
    const rendered = renderElement(element, x, y);
    markup.push(rendered.markup);
    x += rendered.width;
    markup.push(
      `<path class="railroad-track" d="M ${String(x)} ${String(centerY)} h ${String(HORIZONTAL_GAP)}"/>`,
    );
    x += HORIZONTAL_GAP;
  });
  markup.push(
    `<path class="railroad-track" d="M ${String(x)} ${String(centerY)} H ${String(totalWidth - PADDING)}"/>`,
  );
  return markup.join("");
};

const renderFolded = (folded: FoldedRecursion, y: number, totalWidth: number): string => {
  const combined = [...folded.item, ...folded.separator];
  const lane = renderLane(combined, y, totalWidth);
  const direction = folded.direction === "left" ? "counterclockwise" : "clockwise";
  const optional = folded.optional ? "zero or more" : "one or more";
  const loopY = y + ELEMENT_HEIGHT + 15;
  return `${lane}<path class="railroad-loop" d="M ${String(totalWidth - PADDING - 20)} ${String(y + ELEMENT_HEIGHT / 2)} v ${String(loopY - y)} H ${String(PADDING + 20)} v -${String(loopY - y)}"/><text class="railroad-fold-label" x="${String(totalWidth / 2)}" y="${String(loopY + 16)}" text-anchor="middle">${optional}, ${direction}</text>`;
};

export const renderRailroadSvg = (view: RailroadView): SvgRender => {
  const contentWidths = view.lanes.map((lane) => laneWidth(lane.elements));
  const foldedWidth =
    view.folded === undefined ? 0 : laneWidth([...view.folded.item, ...view.folded.separator]);
  const width = Math.max(360, ...contentWidths, foldedWidth) + PADDING * 2;
  const visibleLaneCount = view.folded === undefined ? Math.max(1, view.lanes.length) : 1;
  const height = PADDING * 2 + visibleLaneCount * LANE_GAP + (view.folded === undefined ? 0 : 36);
  const body =
    view.folded === undefined
      ? view.lanes
          .map((lane, index) => renderLane(lane.elements, PADDING + index * LANE_GAP, width))
          .join("")
      : renderFolded(view.folded, PADDING, width);
  const badge =
    view.folded === undefined
      ? ""
      : '<g class="railroad-fold-badge" aria-label="Folded recursion"><rect x="12" y="8" width="116" height="22" rx="11"/><text x="70" y="23" text-anchor="middle">Folded recursion</text></g>';
  const conflictBadge =
    view.conflict === true
      ? `<g class="railroad-conflict-badge" aria-label="Rule involved in a parser conflict"><rect x="${String(width - 104)}" y="8" width="92" height="22" rx="11"/><text x="${String(width - 58)}" y="23" text-anchor="middle">Conflict</text></g>`
      : "";
  const classes = `syntaxpad-railroad${view.conflict === true ? " has-conflict" : ""}`;
  const conflictLabel = view.conflict === true ? ", parser conflict" : "";
  const svg = `<svg class="${classes}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(height)}" role="img" aria-label="Railroad diagram for ${escapeXml(view.name)}${conflictLabel}">${badge}${conflictBadge}${body}</svg>`;
  return {
    folded: view.folded !== undefined,
    height,
    svg,
    width,
    ...(view.conflict === true ? { conflict: true } : {}),
  };
};
