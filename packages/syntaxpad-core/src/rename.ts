import { finalizeTransform } from "./patches.js";
import type {
  ActionReference,
  GrammarDocument,
  SourceRange,
  TextPatch,
  TransformResult,
} from "./types.js";

const VALID_SYMBOL_NAME = /^[A-Za-z_.][A-Za-z0-9_.-]*$/u;

const targetNameRange = (
  source: string,
  reference: ActionReference,
  name: string,
): SourceRange | undefined => {
  const text = source.slice(reference.range.start, reference.range.end);
  const relativeStart = text.indexOf(name);
  if (relativeStart < 0) {
    return undefined;
  }
  return {
    end: reference.range.start + relativeStart + name.length,
    start: reference.range.start + relativeStart,
  };
};

const addPatch = (patches: Map<string, TextPatch>, range: SourceRange, text: string): void => {
  patches.set(`${String(range.start)}:${String(range.end)}`, { range, text });
};

export const renameSymbol = (
  document: GrammarDocument,
  oldName: string,
  newName: string,
): TransformResult => {
  if (!VALID_SYMBOL_NAME.test(newName)) {
    return {
      error: {
        code: "invalid-symbol-name",
        message: `"${newName}" is not a valid grammar symbol name.`,
      },
      ok: false,
    };
  }
  if (oldName === newName) {
    return {
      error: { code: "unchanged-symbol-name", message: "The new name is unchanged." },
      ok: false,
    };
  }

  const patches = new Map<string, TextPatch>();
  document.declarations.forEach((declaration) => {
    declaration.symbols
      .filter((symbol) => symbol.name === oldName)
      .forEach((symbol) => {
        addPatch(patches, symbol.range, newName);
      });
  });
  document.rules.forEach((rule) => {
    if (rule.name === oldName) {
      addPatch(patches, rule.nameRange, newName);
    }
    rule.parameterNames
      .filter((parameter) => parameter.name === oldName)
      .forEach((parameter) => {
        addPatch(patches, parameter.range, newName);
      });
    rule.alternatives.forEach((alternative) => {
      alternative.items.forEach((item) => {
        if (item.kind === "symbol" || item.kind === "parameterized") {
          if (item.name === oldName) {
            addPatch(patches, item.nameRange, newName);
          }
          if (item.namedReference?.name === oldName) {
            addPatch(
              patches,
              {
                end: item.namedReference.range.end - 1,
                start: item.namedReference.range.start + 1,
              },
              newName,
            );
          }
        }
        if (item.kind === "parameterized") {
          item.arguments
            .filter((argument) => argument.name === oldName)
            .forEach((argument) => {
              addPatch(patches, argument.range, newName);
            });
        }
        if (item.kind === "action") {
          item.references.forEach((reference) => {
            if (reference.target.kind !== "name" || reference.target.name !== oldName) {
              return;
            }
            const range = targetNameRange(document.source, reference, oldName);
            if (range !== undefined) {
              addPatch(patches, range, newName);
            }
          });
        }
      });
    });
  });

  if (patches.size === 0) {
    return {
      error: { code: "symbol-not-found", message: `Symbol "${oldName}" was not found.` },
      ok: false,
    };
  }

  return finalizeTransform({
    document,
    patches: [...patches.values()],
    verify: (updated) =>
      updated.rules.some((rule) => rule.name === oldName)
        ? {
            code: "rename-postcondition-failed",
            message: `A definition of "${oldName}" remains after rename.`,
          }
        : undefined,
  });
};
