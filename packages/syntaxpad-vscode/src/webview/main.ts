import { hostMessageSchema, type GrammarViewModel, type ViewMessage } from "../protocol.js";

interface VsCodeApi {
  postMessage(message: ViewMessage): void;
}

declare const acquireVsCodeApi: () => VsCodeApi;

const vscode = acquireVsCodeApi();

const requiredElement = <ElementType extends HTMLElement>(
  selector: string,
  constructor: new () => ElementType,
): ElementType => {
  const element = document.querySelector(selector);
  if (!(element instanceof constructor)) {
    throw new Error(`Missing Webview element ${selector}`);
  }
  return element;
};

const ruleSelect = requiredElement("#rule-select", HTMLSelectElement);
const search = requiredElement("#search", HTMLInputElement);
const graphMode = requiredElement("#graph-mode", HTMLSelectElement);
const distance = requiredElement("#distance", HTMLSelectElement);
const foldToggle = requiredElement("#fold-toggle", HTMLButtonElement);
const runConflicts = requiredElement("#run-conflicts", HTMLButtonElement);
const railroad = requiredElement("#railroad", HTMLDivElement);
const dependency = requiredElement("#dependency", HTMLDivElement);
const alternativeControls = requiredElement("#alternative-controls", HTMLDivElement);
const ruleName = requiredElement("#rule-name", HTMLSpanElement);
const graphNote = requiredElement("#graph-note", HTMLSpanElement);
const conflictSummary = requiredElement("#conflict-summary", HTMLSpanElement);
const conflicts = requiredElement("#conflicts", HTMLDivElement);
const status = requiredElement("#status", HTMLElement);
let currentModel: GrammarViewModel | undefined;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let draggedAlternative: number | undefined;

const post = (message: ViewMessage): void => {
  vscode.postMessage(message);
};

const updateRuleOptions = (model: GrammarViewModel): void => {
  const signature = model.rules.map((rule) => rule.id).join("\u0000");
  if (ruleSelect.dataset.signature !== signature) {
    ruleSelect.replaceChildren(
      ...model.rules.map((rule) => {
        const option = document.createElement("option");
        option.value = rule.name;
        option.textContent = rule.name;
        return option;
      }),
    );
    ruleSelect.dataset.signature = signature;
  }
  ruleSelect.value = model.selectedRuleName;
};

const moveAlternative = (from: number, to: number): void => {
  if (
    currentModel === undefined ||
    from === to ||
    to < 0 ||
    to >= currentModel.alternatives.length
  ) {
    return;
  }
  post({
    from,
    ruleId: currentModel.selectedRuleId,
    to,
    type: "moveAlternative",
  });
};

const updateAlternativeControls = (model: GrammarViewModel): void => {
  alternativeControls.replaceChildren(
    ...model.alternatives.map((alternative) => {
      const row = document.createElement("div");
      row.className = "alternative-row";
      row.draggable = true;
      row.dataset.index = String(alternative.index);
      const label = document.createElement("span");
      label.textContent = `${String(alternative.index + 1)}. ${alternative.label}`;
      const up = document.createElement("button");
      up.type = "button";
      up.textContent = "Move up";
      up.disabled = alternative.index === 0;
      up.addEventListener("click", () => {
        moveAlternative(alternative.index, alternative.index - 1);
      });
      const down = document.createElement("button");
      down.type = "button";
      down.textContent = "Move down";
      down.disabled = alternative.index === model.alternatives.length - 1;
      down.addEventListener("click", () => {
        moveAlternative(alternative.index, alternative.index + 1);
      });
      row.addEventListener("dragstart", () => {
        draggedAlternative = alternative.index;
      });
      row.addEventListener("dragover", (event) => {
        event.preventDefault();
      });
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        if (draggedAlternative !== undefined) {
          moveAlternative(draggedAlternative, alternative.index);
        }
        draggedAlternative = undefined;
      });
      row.append(label, up, down);
      return row;
    }),
  );
};

const updateConflicts = (model: GrammarViewModel): void => {
  const report = model.conflictReport;
  if (report === undefined) {
    conflictSummary.textContent = "Not run";
    const message = document.createElement("p");
    message.textContent = "Run conflict analysis to inspect parser-generator results.";
    conflicts.replaceChildren(message);
    return;
  }
  conflictSummary.textContent = `${String(report.totals.shiftReduce)} S/R · ${String(report.totals.reduceReduce)} R/R · ${report.format} · ${report.detail}`;
  const children: HTMLElement[] = report.conflicts.map((conflict) => {
    const article = document.createElement("article");
    article.className = "conflict-item";
    const heading = document.createElement("strong");
    heading.textContent = conflict.message;
    article.append(heading);
    if (conflict.targets.length > 0) {
      const targetList = document.createElement("div");
      targetList.className = "conflict-targets";
      conflict.targets.forEach((target) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `Go to ${target.ruleName}`;
        button.addEventListener("click", () => {
          post({
            end: target.end,
            preferDefinition: false,
            start: target.start,
            type: "navigate",
            uri: model.uri,
          });
        });
        targetList.append(button);
      });
      article.append(targetList);
    } else {
      const unmapped = document.createElement("span");
      unmapped.className = "conflict-unmapped";
      unmapped.textContent = "Location unavailable";
      article.append(unmapped);
    }
    if (conflict.counterexample !== undefined) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Counterexample";
      const pre = document.createElement("pre");
      pre.textContent = conflict.counterexample;
      details.append(summary, pre);
      article.append(details);
    }
    return article;
  });
  report.messages.forEach((text) => {
    const message = document.createElement("p");
    message.className = "conflict-message";
    message.textContent = text;
    children.push(message);
  });
  if (children.length === 0) {
    const clear = document.createElement("p");
    clear.textContent =
      report.detail === "failed"
        ? "Conflict analysis failed without a detailed report."
        : "No parser conflicts were reported.";
    children.push(clear);
  }
  conflicts.replaceChildren(...children);
};

const activateRangedElement = (element: Element, preferDefinition: boolean): void => {
  if (currentModel === undefined) {
    return;
  }
  const start = Number(element.getAttribute("data-start"));
  const end = Number(element.getAttribute("data-end"));
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
    return;
  }
  post({
    end,
    preferDefinition,
    start,
    type: "navigate",
    uri: currentModel.uri,
  });
};

const diagramInteraction = (event: MouseEvent | KeyboardEvent): void => {
  if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const interactive = target.closest(".dependency-node[data-symbol], [data-start][data-end]");
  if (interactive === null) {
    return;
  }
  event.preventDefault();
  const symbol = interactive.getAttribute("data-symbol");
  if (symbol !== null) {
    post({ symbol, type: "selectRule" });
  }
  if (interactive.hasAttribute("data-start") && interactive.hasAttribute("data-end")) {
    activateRangedElement(interactive, interactive.classList.contains("railroad-element"));
  }
};

railroad.addEventListener("click", diagramInteraction);
railroad.addEventListener("keydown", diagramInteraction);
dependency.addEventListener("click", diagramInteraction);
dependency.addEventListener("keydown", diagramInteraction);

ruleSelect.addEventListener("change", () => {
  post({ symbol: ruleSelect.value, type: "selectRule" });
});

foldToggle.addEventListener("click", () => {
  const folded = foldToggle.getAttribute("aria-pressed") !== "true";
  foldToggle.setAttribute("aria-pressed", String(folded));
  post({ folded, type: "toggleFold" });
});

runConflicts.addEventListener("click", () => {
  post({ type: "runConflicts" });
});

const postGraphSettings = (): void => {
  const mode = graphMode.value;
  if (mode !== "all" && mode !== "neighborhood" && mode !== "reachable") {
    return;
  }
  post({
    distance: Number.parseInt(distance.value, 10),
    mode,
    type: "setGraph",
  });
};

graphMode.addEventListener("change", postGraphSettings);
distance.addEventListener("change", postGraphSettings);
search.addEventListener("input", () => {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    post({ query: search.value, type: "search" });
  }, 120);
});

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const parsed = hostMessageSchema.safeParse(event.data);
  if (!parsed.success) {
    status.textContent = "Received an invalid host update.";
    return;
  }
  const message = parsed.data;
  if (message.type === "error") {
    status.textContent = message.message;
    return;
  }
  if (message.type === "selection") {
    document.querySelectorAll<SVGElement>(".is-selected").forEach((element) => {
      element.classList.remove("is-selected");
    });
    document.querySelectorAll<SVGElement>("[data-start][data-end]").forEach((element) => {
      const start = Number(element.dataset.start);
      const end = Number(element.dataset.end);
      if (message.offset >= start && message.offset <= end) {
        element.classList.add("is-selected");
      }
    });
    return;
  }

  currentModel = message.model;
  updateRuleOptions(message.model);
  updateAlternativeControls(message.model);
  updateConflicts(message.model);
  railroad.innerHTML = message.model.railroadSvg;
  dependency.innerHTML = message.model.dependencySvg;
  ruleName.textContent = message.model.selectedRuleName;
  graphMode.value = message.model.graphMode;
  distance.value = String(message.model.distance);
  foldToggle.setAttribute("aria-pressed", String(message.model.foldingEnabled));
  graphNote.textContent = message.model.truncated ? "Node limit reached" : "";
  const conflictCount =
    (message.model.conflictReport?.totals.shiftReduce ?? 0) +
    (message.model.conflictReport?.totals.reduceReduce ?? 0);
  status.textContent = `${String(message.model.ruleCount)} rules · ${String(message.model.references)} references · ${String(message.model.diagnostics)} diagnostics · ${String(conflictCount)} conflicts`;
});

post({ type: "ready" });
