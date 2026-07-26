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
const railroad = requiredElement("#railroad", HTMLDivElement);
const dependency = requiredElement("#dependency", HTMLDivElement);
const alternativeControls = requiredElement("#alternative-controls", HTMLDivElement);
const ruleName = requiredElement("#rule-name", HTMLSpanElement);
const graphNote = requiredElement("#graph-note", HTMLSpanElement);
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
  railroad.innerHTML = message.model.railroadSvg;
  dependency.innerHTML = message.model.dependencySvg;
  ruleName.textContent = message.model.selectedRuleName;
  graphMode.value = message.model.graphMode;
  distance.value = String(message.model.distance);
  foldToggle.setAttribute("aria-pressed", String(message.model.foldingEnabled));
  graphNote.textContent = message.model.truncated ? "Node limit reached" : "";
  status.textContent = `${String(message.model.ruleCount)} rules · ${String(message.model.references)} references · ${String(message.model.diagnostics)} diagnostics`;
});

post({ type: "ready" });
