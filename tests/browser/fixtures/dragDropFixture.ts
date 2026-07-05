type DragDropEventTrace = {
  clientX: number;
  clientY: number;
  data: {
    html: string;
    plain: string;
    types: string[];
  };
  dropEffect: string;
  effectAllowed: string;
  selection: {
    rangeCount: number;
    text: string;
  };
  target: string | null;
  type: string;
};

type DragDropSourceTrace = {
  afterText: string;
  beforeText: string;
  source: "block-boundary" | "figure" | "mention" | "text-range";
  target: string | null;
  types: string[];
};

type DragDropPointTrace = {
  clientX: number;
  clientY: number;
  method: "caretPositionFromPoint" | "caretRangeFromPoint" | "none";
  offset: number | null;
  target: string | null;
  text: string | null;
};

type DragDropMultiRangeTrace = {
  requestedRanges: number;
  rangeCount: number;
  rangeTexts: string[];
  selectionText: string;
};

export type DragDropTrace = {
  dataTransfer: {
    constructorSupported: boolean;
    setDragImageSupported: boolean;
  };
  dropPoint: DragDropPointTrace;
  eventOrder: string[];
  events: DragDropEventTrace[];
  multiRange: DragDropMultiRangeTrace;
  policy: {
    history: "single-command-after-drop";
    nativeDomMutation: "ignored-until-model-command";
    selectionSource: "drop-point-over-dragstart-selection";
  };
  sources: DragDropSourceTrace[];
};

type FixtureDataTransfer = DataTransfer & {
  __editableSetDragImageCalled?: boolean;
};

export function runDragDropTrace(): DragDropTrace {
  const fixture = createDragDropFixture();
  const events: DragDropEventTrace[] = [];
  installEventTrace(fixture.root, events);

  const dataTransfer = createFixtureDataTransfer();
  const sources = [
    runTextRangeDragTrace(fixture, dataTransfer),
    runMentionDragTrace(fixture, createFixtureDataTransfer()),
    runFigureDragTrace(fixture, createFixtureDataTransfer()),
    runBlockBoundaryDropTrace(fixture, createFixtureDataTransfer()),
  ];

  const dropPoint = recordDropPoint(fixture);
  const multiRange = recordMultiRangeSelection(fixture);

  return {
    dataTransfer: {
      constructorSupported: dataTransfer.constructor.name === "DataTransfer",
      setDragImageSupported: dataTransfer.__editableSetDragImageCalled === true,
    },
    dropPoint,
    eventOrder: events.map((event) => event.type),
    events,
    multiRange,
    policy: {
      history: "single-command-after-drop",
      nativeDomMutation: "ignored-until-model-command",
      selectionSource: "drop-point-over-dragstart-selection",
    },
    sources,
  };
}

function createDragDropFixture() {
  const host = document.createElement("section");
  host.dataset.testid = "drag-drop-fixture";
  Object.assign(host.style, {
    background: "white",
    color: "black",
    font: "16px monospace",
    left: "24px",
    lineHeight: "24px",
    padding: "8px",
    position: "fixed",
    top: "24px",
    zIndex: "2147483647",
  });

  const root = document.createElement("div");
  root.contentEditable = "true";
  root.dataset.testid = "drag-root";

  const paragraph = document.createElement("p");
  paragraph.dataset.testid = "drag-paragraph";
  paragraph.textContent = "Alpha beta gamma";

  const atomLine = document.createElement("p");
  atomLine.dataset.testid = "drag-atom-line";
  atomLine.append(document.createTextNode("Before "));
  const mention = document.createElement("span");
  mention.contentEditable = "false";
  mention.dataset.editableAtom = "mention-ada";
  mention.dataset.testid = "drag-mention";
  mention.draggable = true;
  mention.textContent = "@Ada";
  atomLine.append(mention, document.createTextNode(" after"));

  const figure = document.createElement("figure");
  figure.contentEditable = "false";
  figure.dataset.testid = "drag-figure";
  figure.draggable = true;
  figure.textContent = "figure block";
  Object.assign(figure.style, {
    border: "1px solid #999",
    display: "block",
    margin: "4px 0",
    padding: "4px",
  });

  const tail = document.createElement("p");
  tail.dataset.testid = "drag-tail";
  tail.textContent = "Delta epsilon";

  root.append(paragraph, atomLine, figure, tail);
  host.append(root);
  document.body.append(host);

  const paragraphText = paragraph.firstChild;
  const tailText = tail.firstChild;
  if (paragraphText === null || tailText === null) {
    throw new Error("Missing drag/drop fixture text nodes.");
  }

  return {
    figure,
    host,
    mention,
    paragraph,
    paragraphText,
    root,
    tail,
    tailText,
  };
}

function installEventTrace(root: HTMLElement, events: DragDropEventTrace[]) {
  for (const type of ["dragstart", "dragover", "drop", "dragend"]) {
    root.addEventListener(
      type,
      (event) => {
        events.push(recordEvent(event));
      },
      true,
    );
  }
}

function runTextRangeDragTrace(
  fixture: ReturnType<typeof createDragDropFixture>,
  dataTransfer: FixtureDataTransfer,
): DragDropSourceTrace {
  selectText(fixture.paragraphText, 6, 10);
  dataTransfer.effectAllowed = "copyMove";
  dataTransfer.setData("text/plain", "beta");
  dataTransfer.setData("text/html", "<p>beta</p>");
  dataTransfer.setDragImage(fixture.paragraph, 0, 0);
  const beforeText = fixture.paragraph.textContent ?? "";
  dispatchDragEvent(fixture.paragraph, "dragstart", dataTransfer, pointFor(fixture.paragraph));
  dispatchDragEvent(fixture.paragraph, "dragover", dataTransfer, pointFor(fixture.paragraph));
  dispatchDragEvent(fixture.paragraph, "drop", dataTransfer, pointFor(fixture.paragraph));
  dispatchDragEvent(fixture.paragraph, "dragend", dataTransfer, pointFor(fixture.paragraph));
  return {
    afterText: fixture.paragraph.textContent ?? "",
    beforeText,
    source: "text-range",
    target: "drag-paragraph",
    types: dataTransferTypes(dataTransfer),
  };
}

function runMentionDragTrace(
  fixture: ReturnType<typeof createDragDropFixture>,
  dataTransfer: FixtureDataTransfer,
): DragDropSourceTrace {
  dataTransfer.effectAllowed = "copyMove";
  dataTransfer.setData("text/plain", "@Ada");
  dataTransfer.setData(
    "application/x-editable-atom",
    JSON.stringify({ id: "mention-ada", type: "mention" }),
  );
  const beforeText = fixture.root.textContent ?? "";
  const point = pointFor(fixture.mention);
  dispatchDragEvent(fixture.mention, "dragstart", dataTransfer, point);
  dispatchDragEvent(fixture.paragraph, "drop", dataTransfer, pointFor(fixture.paragraph));
  dispatchDragEvent(fixture.mention, "dragend", dataTransfer, point);
  return {
    afterText: fixture.root.textContent ?? "",
    beforeText,
    source: "mention",
    target: "drag-mention",
    types: dataTransferTypes(dataTransfer),
  };
}

function runFigureDragTrace(
  fixture: ReturnType<typeof createDragDropFixture>,
  dataTransfer: FixtureDataTransfer,
): DragDropSourceTrace {
  dataTransfer.effectAllowed = "copyMove";
  dataTransfer.setData("text/plain", "figure block");
  dataTransfer.setData(
    "application/x-editable-block",
    JSON.stringify({ id: "figure-1", type: "figure" }),
  );
  const beforeText = fixture.root.textContent ?? "";
  const point = pointFor(fixture.figure);
  dispatchDragEvent(fixture.figure, "dragstart", dataTransfer, point);
  dispatchDragEvent(fixture.tail, "drop", dataTransfer, pointFor(fixture.tail));
  dispatchDragEvent(fixture.figure, "dragend", dataTransfer, point);
  return {
    afterText: fixture.root.textContent ?? "",
    beforeText,
    source: "figure",
    target: "drag-figure",
    types: dataTransferTypes(dataTransfer),
  };
}

function runBlockBoundaryDropTrace(
  fixture: ReturnType<typeof createDragDropFixture>,
  dataTransfer: FixtureDataTransfer,
): DragDropSourceTrace {
  dataTransfer.effectAllowed = "copyMove";
  dataTransfer.setData("text/plain", "boundary");
  const beforeText = fixture.root.textContent ?? "";
  const point = pointForTextOffset(fixture.tailText, 0);
  dispatchDragEvent(fixture.tail, "dragover", dataTransfer, point);
  dispatchDragEvent(fixture.tail, "drop", dataTransfer, point);
  return {
    afterText: fixture.root.textContent ?? "",
    beforeText,
    source: "block-boundary",
    target: "drag-tail",
    types: dataTransferTypes(dataTransfer),
  };
}

function recordDropPoint(
  fixture: ReturnType<typeof createDragDropFixture>,
): DragDropPointTrace {
  const point = pointForTextOffset(fixture.paragraphText, 11);
  const caret = caretFromPoint(point.x, point.y);
  return {
    clientX: point.x,
    clientY: point.y,
    method: caret.method,
    offset: caret.offset,
    target: describeElement(document.elementFromPoint(point.x, point.y)),
    text: caret.node?.textContent ?? null,
  };
}

function recordMultiRangeSelection(
  fixture: ReturnType<typeof createDragDropFixture>,
): DragDropMultiRangeTrace {
  const first = document.createRange();
  first.setStart(fixture.paragraphText, 0);
  first.setEnd(fixture.paragraphText, 5);
  const second = document.createRange();
  second.setStart(fixture.tailText, 0);
  second.setEnd(fixture.tailText, 5);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(first);
  selection?.addRange(second);
  return {
    rangeCount: selection?.rangeCount ?? 0,
    rangeTexts: ranges(selection).map((range) => range.toString()),
    requestedRanges: 2,
    selectionText: selection?.toString() ?? "",
  };
}

function dispatchDragEvent(
  target: EventTarget,
  type: string,
  dataTransfer: FixtureDataTransfer,
  point: { x: number; y: number },
) {
  const event =
    typeof DragEvent === "function"
      ? new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          dataTransfer,
        })
      : new Event(type, { bubbles: true, cancelable: true });
  if (!("dataTransfer" in event)) {
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  }
  target.dispatchEvent(event);
}

function recordEvent(event: Event): DragDropEventTrace {
  const dataTransfer =
    "dataTransfer" in event &&
    typeof DataTransfer === "function" &&
    event.dataTransfer instanceof DataTransfer
      ? event.dataTransfer
      : null;
  const selection = document.getSelection();
  return {
    clientX: "clientX" in event && typeof event.clientX === "number" ? event.clientX : 0,
    clientY: "clientY" in event && typeof event.clientY === "number" ? event.clientY : 0,
    data: {
      html: dataTransfer?.getData("text/html") ?? "",
      plain: dataTransfer?.getData("text/plain") ?? "",
      types: dataTransfer === null ? [] : dataTransferTypes(dataTransfer),
    },
    dropEffect: dataTransfer?.dropEffect ?? "",
    effectAllowed: dataTransfer?.effectAllowed ?? "",
    selection: {
      rangeCount: selection?.rangeCount ?? 0,
      text: selection?.toString() ?? "",
    },
    target: describeEventTarget(event),
    type: event.type,
  };
}

function createFixtureDataTransfer(): FixtureDataTransfer {
  if (typeof DataTransfer === "function") {
    const dataTransfer = new DataTransfer() as FixtureDataTransfer;
    const setDragImage = dataTransfer.setDragImage.bind(dataTransfer);
    dataTransfer.setDragImage = (...args) => {
      dataTransfer.__editableSetDragImageCalled = true;
      setDragImage(...args);
    };
    return dataTransfer;
  }

  const store = new Map<string, string>();
  const dataTransfer = {
    __editableSetDragImageCalled: false,
    clearData(type?: string) {
      if (type === undefined) {
        store.clear();
      } else {
        store.delete(type);
      }
    },
    dropEffect: "none",
    effectAllowed: "uninitialized",
    files: [] as unknown as FileList,
    getData(type: string) {
      return store.get(type) ?? "";
    },
    items: [] as unknown as DataTransferItemList,
    setData(type: string, data: string) {
      store.set(type, data);
    },
    setDragImage() {
      dataTransfer.__editableSetDragImageCalled = true;
    },
    types: [] as readonly string[],
  } as unknown as FixtureDataTransfer;
  return dataTransfer;
}

function dataTransferTypes(dataTransfer: DataTransfer): string[] {
  return Array.from(dataTransfer.types);
}

function selectText(node: ChildNode, start: number, end: number) {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function ranges(selection: Selection | null): Range[] {
  if (selection === null) {
    return [];
  }
  return Array.from({ length: selection.rangeCount }, (_, index) =>
    selection.getRangeAt(index),
  );
}

function pointFor(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.top + rect.height / 2),
  };
}

function pointForTextOffset(node: ChildNode, offset: number): { x: number; y: number } {
  const range = document.createRange();
  range.setStart(node, Math.min(offset, node.textContent?.length ?? 0));
  range.setEnd(node, Math.min(offset + 1, node.textContent?.length ?? 0));
  const rect = range.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) {
    return {
      x: Math.round(rect.left + 1),
      y: Math.round(rect.top + rect.height / 2),
    };
  }
  return pointFor(node.parentElement ?? document.body);
}

function caretFromPoint(
  x: number,
  y: number,
): {
  method: DragDropPointTrace["method"];
  node: Node | null;
  offset: number | null;
} {
  if (typeof document.caretPositionFromPoint === "function") {
    const position = document.caretPositionFromPoint(x, y);
    return {
      method: "caretPositionFromPoint",
      node: position?.offsetNode ?? null,
      offset: position?.offset ?? null,
    };
  }
  if (typeof document.caretRangeFromPoint === "function") {
    const range = document.caretRangeFromPoint(x, y);
    return {
      method: "caretRangeFromPoint",
      node: range?.startContainer ?? null,
      offset: range?.startOffset ?? null,
    };
  }
  return { method: "none", node: null, offset: null };
}

function describeEventTarget(event: Event): string | null {
  const target = event.composedPath()[0] ?? event.target;
  return target instanceof Element ? describeElement(target) : null;
}

function describeElement(element: Element | null): string | null {
  if (element === null) {
    return null;
  }
  const testId = element.getAttribute("data-testid");
  if (testId !== null) {
    return testId;
  }
  return element.tagName.toLowerCase();
}
