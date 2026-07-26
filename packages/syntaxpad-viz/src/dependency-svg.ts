import type { DependencyGraphView, DependencyNode, SvgRender } from "./types.js";

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const edgePath = (points: readonly { readonly x: number; readonly y: number }[]): string =>
  points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${String(point.x)} ${String(point.y)}`)
    .join(" ");

const statusLabel = (node: DependencyNode): string =>
  node.statuses.length === 0 ? "" : node.statuses.join(", ");

const renderNode = (node: DependencyNode): string => {
  const x = node.x - node.width / 2;
  const y = node.y - node.height / 2;
  const statuses = statusLabel(node);
  const degreeClass = node.degree >= 5 ? "degree-high" : node.degree >= 3 ? "degree-medium" : "";
  const classes = [
    "dependency-node",
    `kind-${node.kind}`,
    degreeClass,
    ...node.statuses.map((status) => `status-${status}`),
  ]
    .filter((value) => value.length > 0)
    .join(" ");
  const range =
    node.range === undefined
      ? ""
      : `data-start="${String(node.range.start)}" data-end="${String(node.range.end)}"`;
  const distance =
    node.distanceFromStart === undefined ? "" : `data-distance="${String(node.distanceFromStart)}"`;
  const distanceLabel =
    node.distanceFromStart === undefined
      ? ""
      : `, distance ${String(node.distanceFromStart)} from start`;
  const statusMarkup =
    statuses.length === 0
      ? ""
      : `<text class="dependency-status" x="${String(node.x)}" y="${String(y + node.height + 14)}" text-anchor="middle">${escapeXml(statuses)}</text>`;
  return `<g class="${classes}" role="button" tabindex="0" aria-label="${escapeXml(`${node.id}, ${node.kind}, degree ${String(node.degree)}${distanceLabel}${statuses.length === 0 ? "" : `, ${statuses}`}`)}" data-degree="${String(node.degree)}" data-symbol="${escapeXml(node.id)}" ${range} ${distance}><rect x="${String(x)}" y="${String(y)}" width="${String(node.width)}" height="${String(node.height)}" rx="7"/><text x="${String(node.x)}" y="${String(node.y + 5)}" text-anchor="middle">${escapeXml(node.id)}</text>${statusMarkup}</g>`;
};

export const renderDependencySvg = (view: DependencyGraphView): SvgRender => {
  const edgeMarkup = view.edges
    .map(
      (edge) =>
        `<path class="dependency-edge" d="${edgePath(edge.points)}" marker-end="url(#syntaxpad-arrow)" data-from="${escapeXml(edge.from)}" data-to="${escapeXml(edge.to)}"/>`,
    )
    .join("");
  const nodes = view.nodes.map(renderNode).join("");
  const truncated = view.truncated
    ? '<text class="dependency-truncated" x="16" y="20">Node limit reached; refine the view.</text>'
    : "";
  const svg = `<svg class="syntaxpad-dependency" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(view.width)} ${String(view.height)}" role="img" aria-label="${escapeXml(`${view.mode} grammar dependency graph`)}"><defs><marker id="syntaxpad-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>${truncated}<g class="dependency-edges">${edgeMarkup}</g><g class="dependency-nodes">${nodes}</g></svg>`;
  return { folded: false, height: view.height, svg, width: view.width };
};
