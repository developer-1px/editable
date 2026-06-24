import { createJSONDocument } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import { koreanHangulActiveMarkTrace } from "../fixtures/ime/koreanHangulActiveMarkTrace";
import {
  koreanHangulAdjacentStaleFinishTrace,
  koreanHangulAdjacentStaleStartTrace,
} from "../fixtures/ime/koreanHangulAdjacentStaleTrace";
import { koreanHangulBasicTrace } from "../fixtures/ime/koreanHangulBasicTrace";
import { koreanHangulCompositionBlurTrace } from "../fixtures/ime/koreanHangulCompositionBlurTrace";
import { koreanHangulCompositionHistoryTrace } from "../fixtures/ime/koreanHangulCompositionHistoryTrace";
import { koreanHangulEnterConfirmTrace } from "../fixtures/ime/koreanHangulEnterConfirmTrace";
import { p0SelectionDeletionClipboardTraces } from "../fixtures/input/p0SelectionDeletionClipboardTrace";
import type { EditorTraceReplay } from "../testing/editorTraceReplay";
import {
  type P0InputArea,
  type P0InputScenario,
  type P0SelectionExpectation,
  type P0SelectionPointExpectation,
  p0BrowserInputScenarios,
  p0HeadlessInputScenarios,
  p0InputConformanceMatrix,
  p0ReplayTraceScenarioIds,
} from "../testing/p0InputConformanceMatrix";
import { defaultSelection, selectionForCommand } from "./editorSelection";
import {
  type EditorInput,
  type EditorInputResult,
  translateEditorInput,
} from "./inputAdapter";
import {
  createNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
  NoteDocumentSchema,
  readBlockText,
} from "./noteDocument";
import {
  type RichSelection,
  selectionFromRichSelection,
} from "./richSelection";

const replayTraces = [
  ...p0SelectionDeletionClipboardTraces,
  koreanHangulActiveMarkTrace,
  koreanHangulAdjacentStaleStartTrace,
  koreanHangulAdjacentStaleFinishTrace,
  koreanHangulBasicTrace,
  koreanHangulCompositionBlurTrace,
  koreanHangulCompositionHistoryTrace,
  koreanHangulEnterConfirmTrace,
] satisfies readonly EditorTraceReplay[];

const requiredAreas = [
  "atom-boundary",
  "browser-event-order",
  "clipboard",
  "delete",
  "enter",
  "ime",
  "keyboard-modifier",
  "selection",
  "text-mutation",
] satisfies readonly P0InputArea[];

const requiredScenarioIds = [
  "SEL-COLLAPSED-ARROW-RIGHT",
  "SEL-RANGE-ARROWRIGHT-COLLAPSE",
  "SEL-RANGE-ARROWLEFT-COLLAPSE",
  "SEL-SHIFT-ARROWRIGHT-EXTEND",
  "ATOM-SHIFT-ARROWRIGHT-SELECT",
  "FIGURE-ARROWRIGHT-AFTER",
  "BROWSER-PRINTABLE-EVENT-ORDER",
  "MUT-RANGE-REPLACEMENT-TYPING",
  "ENTER-COLLAPSED-SPLIT",
  "CLIP-PLAIN-PASTE",
  "DEL-RANGE-BACKSPACE",
  "DEL-RANGE-FORWARD",
  "DEL-EMPTY-BLOCK-BACKSPACE",
  "DEL-WHITESPACE-BLOCK-BACKSPACE",
  "MOD-MAC-PRIMARY-A-SELECT-ALL",
  "MOD-OTHER-PRIMARY-A-SELECT-ALL",
  "MOD-MAC-CTRL-F-NAVIGATION",
  "MOD-ALTGRAPH-PRINTABLE-KEYDOWN-PASSTHROUGH",
  "IME-COMPOSITION-COMMIT-ENTER",
];

const requiredBrowserScenarioIds = [
  "SEL-COLLAPSED-ARROW-RIGHT",
  "SEL-RANGE-ARROWRIGHT-COLLAPSE",
  "SEL-RANGE-ARROWLEFT-COLLAPSE",
  "SEL-SHIFT-ARROWRIGHT-EXTEND",
  "ATOM-SHIFT-ARROWRIGHT-SELECT",
  "FIGURE-ARROWRIGHT-AFTER",
  "BROWSER-PRINTABLE-EVENT-ORDER",
  "MUT-RANGE-REPLACEMENT-TYPING",
  "ENTER-COLLAPSED-SPLIT",
  "CLIP-PLAIN-PASTE",
  "DEL-RANGE-BACKSPACE",
  "DEL-RANGE-FORWARD",
  "MOD-ALTGRAPH-PRINTABLE-KEYDOWN-PASSTHROUGH",
];

describe("P0 input conformance matrix", () => {
  it("documents the required P0 input surface with stable scenario ids", () => {
    expect(p0InputConformanceMatrix.map((scenario) => scenario.id)).toEqual(
      requiredScenarioIds,
    );
    expect(
      requiredAreas.filter(
        (area) =>
          !p0InputConformanceMatrix.some((scenario) => scenario.area === area),
      ),
    ).toEqual([]);
  });

  it("runs every headless scenario as a pure model transition", () => {
    for (const scenario of p0HeadlessInputScenarios) {
      const result = runHeadlessScenario(scenario);

      expect(result.handled, scenario.id).toBe(scenario.expected.handled);
      expectDocumentExpectation(result.document, scenario);
      expectSelectionExpectation(result.selection, scenario);
    }
  });

  it("keeps replay trace coverage connected to matrix scenario ids", () => {
    const replayNames = new Set(replayTraces.map((trace) => trace.name));

    for (const scenario of p0InputConformanceMatrix) {
      for (const traceName of scenario.replayTraceNames ?? []) {
        expect(replayNames.has(traceName), scenario.id).toBe(true);
      }
    }

    expect(p0ReplayTraceScenarioIds).toContain("IME-COMPOSITION-COMMIT-ENTER");
  });

  it("keeps browser scenarios explicit about event evidence", () => {
    expect(p0BrowserInputScenarios.map((scenario) => scenario.id)).toEqual(
      requiredBrowserScenarioIds,
    );
    for (const scenario of p0BrowserInputScenarios) {
      expect(scenario.browser?.trace.length, scenario.id).toBeGreaterThan(0);
    }
  });
});

function runHeadlessScenario(scenario: P0InputScenario) {
  if (scenario.headless === undefined) {
    throw new Error(`Scenario ${scenario.id} has no headless input.`);
  }
  const document = createDocument(scenario);
  const jsonDocument = createJSONDocument(NoteDocumentSchema, document, {
    history: 0,
    selection: true,
    trustedInitial: true,
  });
  jsonDocument.selection?.restore(
    selectionFromRichSelection(
      document,
      scenario.start.selection as RichSelection,
    ),
  );

  const result = translateEditorInput(
    jsonDocument.value,
    selectionForCommand(jsonDocument),
    scenario.headless.input as EditorInput,
    { platform: scenario.headless.platform },
  );
  const handled = handledResult(result);
  if (handled !== null) {
    if (handled.patch.length > 0) {
      const apply = jsonDocument.commit(handled.patch, {
        selectionAfter: handled.selectionAfter,
      });
      expect(apply.ok, scenario.id).toBe(true);
    } else {
      jsonDocument.selection?.restore(handled.selectionAfter);
    }
  }

  return {
    document: jsonDocument.value,
    handled: handled !== null,
    selection:
      jsonDocument.selection?.snapshot() ??
      defaultSelection(jsonDocument.value),
  };
}

function handledResult(result: EditorInputResult) {
  expect(result.ok).toBe(true);
  if (!result.ok || !result.handled) {
    return null;
  }

  return result;
}

function createDocument(scenario: P0InputScenario): NoteDocument {
  return createNoteDocument([...scenario.start.blocks] as NoteBlockInput[], {
    id: `note-${scenario.id.toLowerCase()}`,
    title: scenario.title,
    tags: [],
  });
}

function expectDocumentExpectation(
  document: NoteDocument,
  scenario: P0InputScenario,
) {
  if (scenario.expected.documentText !== undefined) {
    expect(readDocumentText(document), scenario.id).toBe(
      scenario.expected.documentText,
    );
  }

  for (const [path, expectedText] of Object.entries(
    scenario.expected.pathText ?? {},
  )) {
    expect(textAtPath(document, path), scenario.id).toBe(expectedText);
  }
}

function expectSelectionExpectation(
  selection: ReturnType<typeof defaultSelection>,
  scenario: P0InputScenario,
) {
  const expected = scenario.expected.selection;
  if (expected === undefined) {
    return;
  }

  if (expected.type === "caret") {
    expect(selection.focus, scenario.id).toMatchObject(
      pointExpectation(expected),
    );
    expect(selection.anchor, scenario.id).toMatchObject(
      pointExpectation(expected),
    );
    return;
  }

  expect(selection.anchor, scenario.id).toMatchObject(
    pointExpectation(expected.anchor),
  );
  expect(selection.focus, scenario.id).toMatchObject(
    pointExpectation(expected.focus),
  );
  if (expected.selectedPointers !== undefined) {
    expect(selection.selectedPointers, scenario.id).toEqual(
      expected.selectedPointers,
    );
  }
}

function pointExpectation(
  point:
    | Extract<P0SelectionExpectation, { type: "caret" }>
    | P0SelectionPointExpectation,
) {
  return point.offset === undefined
    ? { edge: point.edge, path: point.path }
    : { offset: point.offset, path: point.path };
}

function readDocumentText(document: NoteDocument) {
  return document.root.children.map((block) => readBlockText(block)).join("\n");
}

function textAtPath(document: NoteDocument, path: string) {
  const segments = path.split("/").filter(Boolean);
  let current: unknown = document;
  for (const segment of segments) {
    if (segment === "root") {
      current = document.root;
      continue;
    }
    if (segment === "children") {
      continue;
    }
    if (segment === "text") {
      continue;
    }
    if (/^\d+$/.test(segment) && isObjectWithChildren(current)) {
      current = current.children[Number(segment)];
    }
  }

  return isObjectWithText(current) ? current.text : null;
}

function isObjectWithChildren(
  value: unknown,
): value is { children: unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "children" in value &&
    Array.isArray(value.children)
  );
}

function isObjectWithText(value: unknown): value is { text: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    typeof value.text === "string"
  );
}
