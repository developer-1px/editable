// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { CursorPoint } from "../model/cursor";
import { createDOMCursorGeometry } from "./cursorGeometry";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return new DOMRect(x, y, width, height);
}

function rectShape(value: DOMRect | null) {
  if (value === null) {
    return null;
  }

  return {
    left: value.left,
    top: value.top,
    width: value.width,
    height: value.height,
  };
}

function rectShapes(values: DOMRect[]) {
  return values.map((value) => rectShape(value));
}

function setRect(element: Element, value: DOMRect) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(value);
}

function setupRoot() {
  const root = document.createElement("div");
  root.innerHTML = [
    '<p class="paragraph-block text-block" data-path="/root/children/0">',
    '<span class="text-run" data-path="/root/children/0/children/0/text">Hello</span>',
    '<span class="mention-chip" data-path="/root/children/0/children/1">@Ada</span>',
    "</p>",
    '<figure class="figure-block" data-path="/root/children/1"></figure>',
  ].join("");
  document.body.append(root);

  const text = root.querySelector(
    '[data-path="/root/children/0/children/0/text"]',
  );
  const mention = root.querySelector(
    '[data-path="/root/children/0/children/1"]',
  );
  const paragraph = root.querySelector('[data-path="/root/children/0"]');
  const figure = root.querySelector('[data-path="/root/children/1"]');
  if (
    text === null ||
    mention === null ||
    paragraph === null ||
    figure === null
  ) {
    throw new Error("Fixture failed to render.");
  }

  setRect(paragraph, rect(10, 10, 100, 24));
  setRect(text, rect(10, 10, 50, 20));
  setRect(mention, rect(70, 10, 40, 20));
  setRect(figure, rect(10, 50, 200, 120));

  return root;
}

type InvariantFixture = {
  html: string[];
  rects: Record<string, DOMRect>;
  legalStops: Array<{ label: string; point: CursorPoint }>;
  rowStops: Array<{ label: string; point: CursorPoint; x: number }>;
};

function setupInvariantFixture(fixture: InvariantFixture): Element {
  const root = document.createElement("div");
  root.innerHTML = fixture.html.join("");
  document.body.append(root);

  for (const [path, value] of Object.entries(fixture.rects)) {
    const element = root.querySelector(`[data-path="${path}"]`);
    if (element === null) {
      throw new Error(`Fixture failed to render ${path}.`);
    }
    setRect(element, value);
  }

  return root;
}

function textStops(label: string, path: string, text: string) {
  return Array.from({ length: text.length + 1 }, (_, offset) => ({
    label: `${label} offset ${offset}`,
    point: { path, offset } satisfies CursorPoint,
  }));
}

function edgeStops(label: string, path: string) {
  return [
    {
      label: `${label} before`,
      point: { path, edge: "before" } satisfies CursorPoint,
    },
    {
      label: `${label} after`,
      point: { path, edge: "after" } satisfies CursorPoint,
    },
  ];
}

function expectFiniteRect(label: string, value: DOMRect | null) {
  expect(value, label).not.toBeNull();
  if (value === null) {
    return;
  }

  expect(Number.isFinite(value.left), `${label} left`).toBe(true);
  expect(Number.isFinite(value.top), `${label} top`).toBe(true);
  expect(Number.isFinite(value.width), `${label} width`).toBe(true);
  expect(Number.isFinite(value.height), `${label} height`).toBe(true);
  expect(value.height, `${label} height`).toBeGreaterThan(0);
}

const invariantFixtures: Array<{ name: string; fixture: InvariantFixture }> = [
  {
    name: "rich text, consecutive empty paragraphs, block atom, code, wrap",
    fixture: {
      html: [
        '<p class="paragraph-block text-block" data-path="/root/children/0">',
        '<span class="text-run" data-path="/root/children/0/children/0/text">AB</span>',
        '<span class="mention-chip" data-path="/root/children/0/children/1">@Ada</span>',
        '<span class="text-run" data-path="/root/children/0/children/2/text">CD</span>',
        "</p>",
        '<p class="paragraph-block text-block" data-path="/root/children/1">',
        '<span class="text-run" data-path="/root/children/1/children/0/text"></span>',
        "</p>",
        '<p class="paragraph-block text-block" data-path="/root/children/2">',
        '<span class="text-run" data-path="/root/children/2/children/0/text"></span>',
        "</p>",
        '<figure class="figure-block" data-path="/root/children/3"></figure>',
        '<pre class="code-block text-block" data-path="/root/children/4" style="padding: 10px 12px">',
        '<code class="code-block-text text-run" data-path="/root/children/4/text">code</code>',
        "</pre>",
        '<p class="paragraph-block text-block" data-path="/root/children/5">',
        '<span class="text-run" data-path="/root/children/5/children/0/text">EF</span>',
        '<span class="text-run" data-path="/root/children/5/children/1/text">GH</span>',
        "</p>",
      ],
      rects: {
        "/root/children/0": rect(10, 10, 90, 24),
        "/root/children/0/children/1": rect(30, 10, 40, 20),
        "/root/children/1": rect(10, 40, 90, 24),
        "/root/children/2": rect(10, 70, 90, 24),
        "/root/children/3": rect(10, 100, 140, 60),
        "/root/children/4": rect(10, 170, 140, 44),
        "/root/children/5": rect(10, 230, 20, 48),
      },
      legalStops: [
        ...edgeStops("rich paragraph block", "/root/children/0"),
        ...textStops(
          "rich paragraph first text",
          "/root/children/0/children/0/text",
          "AB",
        ),
        ...edgeStops("mention atom", "/root/children/0/children/1"),
        ...textStops(
          "rich paragraph second text",
          "/root/children/0/children/2/text",
          "CD",
        ),
        ...edgeStops("first empty paragraph block", "/root/children/1"),
        ...textStops(
          "first empty paragraph text",
          "/root/children/1/children/0/text",
          "",
        ),
        ...edgeStops("second empty paragraph block", "/root/children/2"),
        ...textStops(
          "second empty paragraph text",
          "/root/children/2/children/0/text",
          "",
        ),
        ...edgeStops("figure block atom", "/root/children/3"),
        ...edgeStops("code block", "/root/children/4"),
        ...textStops("code text", "/root/children/4/text", "code"),
        ...edgeStops("wrapped paragraph block", "/root/children/5"),
        ...textStops(
          "wrapped paragraph first text",
          "/root/children/5/children/0/text",
          "EF",
        ),
        ...textStops(
          "wrapped paragraph second text",
          "/root/children/5/children/1/text",
          "GH",
        ),
      ],
      rowStops: [
        {
          label: "rich paragraph",
          point: { path: "/root/children/0/children/0/text", offset: 0 },
          x: 10,
        },
        {
          label: "first empty paragraph",
          point: { path: "/root/children/1/children/0/text", offset: 0 },
          x: 10,
        },
        {
          label: "second empty paragraph",
          point: { path: "/root/children/2/children/0/text", offset: 0 },
          x: 10,
        },
        {
          label: "figure block atom",
          point: { path: "/root/children/3", edge: "before" },
          x: 10,
        },
        {
          label: "code block",
          point: { path: "/root/children/4/text", offset: 0 },
          x: 10,
        },
        {
          label: "wrapped paragraph first row",
          point: { path: "/root/children/5/children/0/text", offset: 0 },
          x: 10,
        },
        {
          label: "wrapped paragraph second row",
          point: { path: "/root/children/5/children/1/text", offset: 0 },
          x: 10,
        },
      ],
    },
  },
];

type GeneratedBlockKind =
  | "paragraph"
  | "empty"
  | "mention"
  | "figure"
  | "code"
  | "wrap";

type GeneratedBlock = {
  html: string[];
  rects: Record<string, DOMRect>;
  legalStops: Array<{ label: string; point: CursorPoint }>;
  rowStops: Array<{ label: string; point: CursorPoint; x: number }>;
  height: number;
};

function createGeneratedInvariantFixture(seed: number): {
  name: string;
  fixture: InvariantFixture;
} {
  const random = seededRandom(seed);
  const kinds: GeneratedBlockKind[] = [
    "paragraph",
    "empty",
    "mention",
    "figure",
    "code",
    "wrap",
  ];
  const blockCount = 4 + (seed % 4);
  const forcedKind = kinds[seed % kinds.length];
  if (forcedKind === undefined) {
    throw new Error("Generated fixture kind is missing.");
  }
  const html: string[] = [];
  const rects: Record<string, DOMRect> = {};
  const legalStops: InvariantFixture["legalStops"] = [];
  const rowStops: InvariantFixture["rowStops"] = [];
  const generatedKinds: GeneratedBlockKind[] = [];
  let top = 10;

  for (let index = 0; index < blockCount; index += 1) {
    const kind = index === 0 ? forcedKind : pick(kinds, random);
    generatedKinds.push(kind);
    const block = createGeneratedBlock(kind, index, top);
    html.push(...block.html);
    Object.assign(rects, block.rects);
    legalStops.push(...block.legalStops);
    rowStops.push(...block.rowStops);
    top += block.height + 10;
  }

  return {
    name: `seed ${seed}: ${generatedKinds.join(" ")}`,
    fixture: { html, rects, legalStops, rowStops },
  };
}

function createGeneratedBlock(
  kind: GeneratedBlockKind,
  index: number,
  top: number,
): GeneratedBlock {
  const blockPath = `/root/children/${index}`;

  if (kind === "paragraph") {
    const textPath = `${blockPath}/children/0/text`;
    const text = "Text";
    return {
      html: [
        `<p class="paragraph-block text-block" data-path="${blockPath}">`,
        `<span class="text-run" data-path="${textPath}">${text}</span>`,
        "</p>",
      ],
      rects: { [blockPath]: rect(10, top, 120, 24) },
      legalStops: [
        ...edgeStops(`generated paragraph ${index}`, blockPath),
        ...textStops(`generated paragraph ${index} text`, textPath, text),
      ],
      rowStops: [
        {
          label: `generated paragraph ${index}`,
          point: { path: textPath, offset: 0 },
          x: 10,
        },
      ],
      height: 24,
    };
  }

  if (kind === "empty") {
    const textPath = `${blockPath}/children/0/text`;
    return {
      html: [
        `<p class="paragraph-block text-block" data-path="${blockPath}">`,
        `<span class="text-run" data-path="${textPath}"></span>`,
        "</p>",
      ],
      rects: { [blockPath]: rect(10, top, 120, 24) },
      legalStops: [
        ...edgeStops(`generated empty paragraph ${index}`, blockPath),
        ...textStops(`generated empty paragraph ${index} text`, textPath, ""),
      ],
      rowStops: [
        {
          label: `generated empty paragraph ${index}`,
          point: { path: textPath, offset: 0 },
          x: 10,
        },
      ],
      height: 24,
    };
  }

  if (kind === "mention") {
    const firstTextPath = `${blockPath}/children/0/text`;
    const mentionPath = `${blockPath}/children/1`;
    const secondTextPath = `${blockPath}/children/2/text`;
    return {
      html: [
        `<p class="paragraph-block text-block" data-path="${blockPath}">`,
        `<span class="text-run" data-path="${firstTextPath}">A</span>`,
        `<span class="mention-chip" data-path="${mentionPath}">@Ada</span>`,
        `<span class="text-run" data-path="${secondTextPath}">B</span>`,
        "</p>",
      ],
      rects: {
        [blockPath]: rect(10, top, 120, 24),
        [mentionPath]: rect(30, top, 40, 20),
      },
      legalStops: [
        ...edgeStops(`generated mention paragraph ${index}`, blockPath),
        ...textStops(
          `generated mention paragraph ${index} first text`,
          firstTextPath,
          "A",
        ),
        ...edgeStops(`generated mention ${index}`, mentionPath),
        ...textStops(
          `generated mention paragraph ${index} second text`,
          secondTextPath,
          "B",
        ),
      ],
      rowStops: [
        {
          label: `generated mention paragraph ${index}`,
          point: { path: firstTextPath, offset: 0 },
          x: 10,
        },
      ],
      height: 24,
    };
  }

  if (kind === "figure") {
    return {
      html: [`<figure class="figure-block" data-path="${blockPath}"></figure>`],
      rects: { [blockPath]: rect(10, top, 140, 60) },
      legalStops: edgeStops(`generated figure ${index}`, blockPath),
      rowStops: [
        {
          label: `generated figure ${index}`,
          point: { path: blockPath, edge: "before" },
          x: 10,
        },
      ],
      height: 60,
    };
  }

  if (kind === "code") {
    const textPath = `${blockPath}/text`;
    const text = "code";
    return {
      html: [
        `<pre class="code-block text-block" data-path="${blockPath}" style="padding: 10px 12px">`,
        `<code class="code-block-text text-run" data-path="${textPath}">${text}</code>`,
        "</pre>",
      ],
      rects: { [blockPath]: rect(10, top, 140, 44) },
      legalStops: [
        ...edgeStops(`generated code block ${index}`, blockPath),
        ...textStops(`generated code block ${index} text`, textPath, text),
      ],
      rowStops: [
        {
          label: `generated code block ${index}`,
          point: { path: textPath, offset: 0 },
          x: 10,
        },
      ],
      height: 44,
    };
  }

  const firstTextPath = `${blockPath}/children/0/text`;
  const secondTextPath = `${blockPath}/children/1/text`;
  return {
    html: [
      `<p class="paragraph-block text-block" data-path="${blockPath}">`,
      `<span class="text-run" data-path="${firstTextPath}">AB</span>`,
      `<span class="text-run" data-path="${secondTextPath}">CD</span>`,
      "</p>",
    ],
    rects: { [blockPath]: rect(10, top, 20, 48) },
    legalStops: [
      ...edgeStops(`generated wrapped paragraph ${index}`, blockPath),
      ...textStops(
        `generated wrapped paragraph ${index} first text`,
        firstTextPath,
        "AB",
      ),
      ...textStops(
        `generated wrapped paragraph ${index} second text`,
        secondTextPath,
        "CD",
      ),
    ],
    rowStops: [
      {
        label: `generated wrapped paragraph ${index} first row`,
        point: { path: firstTextPath, offset: 0 },
        x: 10,
      },
      {
        label: `generated wrapped paragraph ${index} second row`,
        point: { path: secondTextPath, offset: 0 },
        x: 10,
      },
    ],
    height: 48,
  };
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function pick<T>(items: T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) {
    throw new Error("Cannot pick from an empty list.");
  }

  return item;
}

const generatedInvariantFixtures = Array.from({ length: 96 }, (_, index) =>
  createGeneratedInvariantFixture(index + 1),
);

const allInvariantFixtures = [
  ...invariantFixtures,
  ...generatedInvariantFixtures,
];

describe("createDOMCursorGeometry", () => {
  it.each(
    allInvariantFixtures,
  )("returns finite rects for every legal cursor stop in $name", ({
    fixture,
  }) => {
    const geometry = createDOMCursorGeometry(setupInvariantFixture(fixture));

    for (const { label, point } of fixture.legalStops) {
      expectFiniteRect(label, geometry.rectForPoint(point));
    }
  });

  it.each(
    allInvariantFixtures,
  )("moves vertically through each visual row in $name", ({ fixture }) => {
    const geometry = createDOMCursorGeometry(setupInvariantFixture(fixture));
    const pointForVerticalMovement = geometry.pointForVerticalMovement;
    if (pointForVerticalMovement === undefined) {
      throw new Error("Directional vertical geometry is unavailable.");
    }

    for (let index = 0; index < fixture.rowStops.length - 1; index += 1) {
      const current = fixture.rowStops[index];
      const next = fixture.rowStops[index + 1];
      if (current === undefined || next === undefined) {
        throw new Error("Fixture row stop is missing.");
      }

      expect(
        pointForVerticalMovement(current.point, current.x, "down", "line"),
        `${current.label} down`,
      ).toMatchObject(next.point);
      expect(
        pointForVerticalMovement(next.point, next.x, "up", "line"),
        `${next.label} up`,
      ).toMatchObject(current.point);
    }
  });

  it.each(
    allInvariantFixtures,
  )("returns line boundaries for every non-figure row stop in $name", ({
    fixture,
  }) => {
    const geometry = createDOMCursorGeometry(setupInvariantFixture(fixture));
    const lineStartPoint = geometry.lineStartPoint;
    const lineEndPoint = geometry.lineEndPoint;
    if (lineStartPoint === undefined || lineEndPoint === undefined) {
      throw new Error("Line boundary geometry is unavailable.");
    }

    for (const { label, point } of fixture.rowStops) {
      if (point.edge !== undefined) {
        continue;
      }

      expect(lineStartPoint(point), `${label} line start`).not.toBeNull();
      expect(lineEndPoint(point), `${label} line end`).not.toBeNull();
    }
  });

  it("returns rects for text offsets from the layout map", () => {
    const geometry = createDOMCursorGeometry(setupRoot());

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/children/0/text",
          offset: 2,
        }),
      ),
    ).toEqual({ left: 30, top: 10, width: 1, height: 24 });
  });

  it("returns rects for text ranges from the layout map", () => {
    const geometry = createDOMCursorGeometry(setupRoot());

    expect(
      rectShapes(
        geometry.rectsForRange(
          { path: "/root/children/0/children/0/text", offset: 1 },
          { path: "/root/children/0/children/0/text", offset: 3 },
        ),
      ),
    ).toEqual([{ left: 20, top: 10, width: 20, height: 24 }]);
  });

  it("returns text rects across inline atom ranges in model order", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/root/children/0">',
      '<span class="text-run" data-path="/root/children/0/children/0/text">AB</span>',
      '<span class="mention-chip" data-path="/root/children/0/children/1">@Ada</span>',
      '<span class="text-run" data-path="/root/children/0/children/2/text">CD</span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const paragraph = root.querySelector('[data-path="/root/children/0"]');
    const mention = root.querySelector(
      '[data-path="/root/children/0/children/1"]',
    );
    if (paragraph === null || mention === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(paragraph, rect(10, 10, 100, 24));
    setRect(mention, rect(30, 10, 40, 20));

    const geometry = createDOMCursorGeometry(root);
    const pointForHorizontalMovement = geometry.pointForHorizontalMovement;
    if (pointForHorizontalMovement === undefined) {
      throw new Error("Horizontal geometry is unavailable.");
    }

    expect(
      rectShapes(
        geometry.rectsForRange(
          { path: "/root/children/0/children/2/text", offset: 1 },
          { path: "/root/children/0/children/0/text", offset: 1 },
        ),
      ),
    ).toEqual([
      { left: 20, top: 10, width: 10, height: 24 },
      { left: 70, top: 10, width: 10, height: 24 },
    ]);
  });

  it("does not invent range rects for atom edges", () => {
    const geometry = createDOMCursorGeometry(setupRoot());

    expect(
      geometry.rectsForRange(
        { path: "/root/children/1", edge: "before" },
        { path: "/root/children/1", edge: "after" },
      ),
    ).toEqual([]);
  });

  it("maps visible offsets through nested marked text nodes", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/root/children/0">',
      '<span class="text-run" data-path="/root/children/0/children/0/text">',
      '<strong class="rich-strong">bold</strong>',
      "</span>",
      "</p>",
    ].join("");
    document.body.append(root);
    const paragraph = root.querySelector('[data-path="/root/children/0"]');
    if (paragraph === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(paragraph, rect(10, 10, 80, 20));

    const geometry = createDOMCursorGeometry(root);
    const pointForHorizontalMovement = geometry.pointForHorizontalMovement;
    if (pointForHorizontalMovement === undefined) {
      throw new Error("Horizontal geometry is unavailable.");
    }

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/children/0/text",
          offset: 3,
        }),
      ),
    ).toEqual({ left: 40, top: 10, width: 1, height: 20 });
  });

  it("returns before and after rects for mention atom edges", () => {
    const geometry = createDOMCursorGeometry(setupRoot());

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/children/1",
          edge: "before",
        }),
      ),
    ).toEqual({ left: 60, top: 10, width: 1, height: 24 });
    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/children/1",
          edge: "after",
        }),
      ),
    ).toEqual({ left: 100, top: 10, width: 1, height: 24 });
  });

  it("returns before and after rects for figure block edges", () => {
    const geometry = createDOMCursorGeometry(setupRoot());

    expect(
      rectShape(
        geometry.rectForPoint({ path: "/root/children/1", edge: "before" }),
      ),
    ).toEqual({ left: 10, top: 50, width: 1, height: 120 });
    expect(
      rectShape(
        geometry.rectForPoint({ path: "/root/children/1", edge: "after" }),
      ),
    ).toEqual({ left: 210, top: 50, width: 1, height: 120 });
  });

  it("returns before and after rects for paragraph block edges", () => {
    const geometry = createDOMCursorGeometry(setupRoot());

    expect(
      rectShape(
        geometry.rectForPoint({ path: "/root/children/0", edge: "before" }),
      ),
    ).toEqual({ left: 10, top: 10, width: 1, height: 24 });
    expect(
      rectShape(
        geometry.rectForPoint({ path: "/root/children/0", edge: "after" }),
      ),
    ).toEqual({ left: 100, top: 10, width: 1, height: 24 });
  });

  it("returns a caret rect for an empty paragraph text point", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/root/children/0">',
      '<span class="text-run" data-path="/root/children/0/children/0/text"></span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const paragraph = root.querySelector('[data-path="/root/children/0"]');
    if (paragraph === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(paragraph, rect(10, 10, 120, 24));

    const geometry = createDOMCursorGeometry(root);
    const pointForHorizontalMovement = geometry.pointForHorizontalMovement;
    if (pointForHorizontalMovement === undefined) {
      throw new Error("Horizontal geometry is unavailable.");
    }

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/children/0/text",
          offset: 0,
        }),
      ),
    ).toEqual({ left: 10, top: 10, width: 1, height: 24 });
  });

  it("returns before and after rects for rich text block edges", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<h2 class="heading-block text-block" data-path="/root/children/0">',
      '<span class="text-run" data-path="/root/children/0/children/0/text">Head</span>',
      "</h2>",
      '<pre class="code-block text-block" data-path="/root/children/1">',
      '<code class="code-block-text text-run" data-path="/root/children/1/text">code</code>',
      "</pre>",
    ].join("");
    document.body.append(root);

    const heading = root.querySelector('[data-path="/root/children/0"]');
    const codeBlock = root.querySelector('[data-path="/root/children/1"]');
    if (heading === null || codeBlock === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(heading, rect(20, 10, 80, 24));
    setRect(codeBlock, rect(20, 50, 80, 24));

    const geometry = createDOMCursorGeometry(root);

    expect(
      rectShape(
        geometry.rectForPoint({ path: "/root/children/0", edge: "before" }),
      ),
    ).toEqual({ left: 20, top: 10, width: 1, height: 24 });
    expect(
      rectShape(
        geometry.rectForPoint({ path: "/root/children/1", edge: "after" }),
      ),
    ).toEqual({ left: 60, top: 50, width: 1, height: 24 });
  });

  it("positions code block carets inside block padding", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<pre class="code-block text-block" data-path="/root/children/0" style="padding: 10px 12px">',
      '<code class="code-block-text text-run" data-path="/root/children/0/text">code</code>',
      "</pre>",
    ].join("");
    document.body.append(root);

    const codeBlock = root.querySelector('[data-path="/root/children/0"]');
    if (codeBlock === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(codeBlock, rect(20, 50, 120, 44));

    const geometry = createDOMCursorGeometry(root);

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/text",
          offset: 0,
        }),
      ),
    ).toEqual({ left: 32, top: 60, width: 1, height: 24 });
  });

  it("collapses wrapped line-boundary text offsets to the next visual line", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/root/children/0" style="line-height: 24px">',
      '<span class="text-run" data-path="/root/children/0/children/0/text">AB</span>',
      '<span class="text-run" data-path="/root/children/0/children/1/text">CD</span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const paragraph = root.querySelector('[data-path="/root/children/0"]');
    if (paragraph === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(paragraph, rect(10, 10, 20, 48));

    const geometry = createDOMCursorGeometry(root);
    const pointForHorizontalMovement = geometry.pointForHorizontalMovement;
    if (pointForHorizontalMovement === undefined) {
      throw new Error("Horizontal geometry is unavailable.");
    }

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/children/0/text",
          offset: 2,
        }),
      ),
    ).toEqual({ left: 10, top: 34, width: 1, height: 24 });
    expect(
      pointForHorizontalMovement(
        {
          path: "/root/children/0/children/0/text",
          offset: 2,
          affinity: "backward",
        },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
      affinity: "forward",
    });
    expect(
      pointForHorizontalMovement(
        {
          path: "/root/children/0/children/1/text",
          offset: 0,
          affinity: "forward",
        },
        "backward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
      affinity: "backward",
    });
  });

  it("resolves coordinates to the nearest valid cursor point", () => {
    const geometry = createDOMCursorGeometry(setupRoot());

    expect(geometry.pointFromCoordinates(40, 12)).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
    expect(geometry.pointFromCoordinates(75, 12)).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "before",
    });
    expect(geometry.pointFromCoordinates(105, 12)).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });
    expect(geometry.pointFromCoordinates(40, 60)).toMatchObject({
      path: "/root/children/1",
      edge: "before",
    });
    expect(geometry.pointFromCoordinates(180, 60)).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
  });

  it("moves vertically by ordered rows instead of nearest current-line hit testing", () => {
    const geometry = createDOMCursorGeometry(setupRoot());
    const pointForVerticalMovement = geometry.pointForVerticalMovement;
    if (pointForVerticalMovement === undefined) {
      throw new Error("Directional vertical geometry is unavailable.");
    }

    expect(
      pointForVerticalMovement(
        { path: "/root/children/0/children/0/text", offset: 2 },
        20,
        "down",
        "line",
      ),
    ).toMatchObject({
      path: "/root/children/1",
      edge: "before",
    });
    expect(
      pointForVerticalMovement(
        { path: "/root/children/1", edge: "before" },
        20,
        "up",
        "line",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });

  it("moves up from an empty paragraph to the previous visual row", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/root/children/0">',
      '<span class="text-run" data-path="/root/children/0/children/0/text">Alpha</span>',
      "</p>",
      '<p class="paragraph-block text-block" data-path="/root/children/1">',
      '<span class="text-run" data-path="/root/children/1/children/0/text"></span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const first = root.querySelector('[data-path="/root/children/0"]');
    const second = root.querySelector('[data-path="/root/children/1"]');
    if (first === null || second === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(first, rect(10, 10, 120, 24));
    setRect(second, rect(10, 40, 120, 24));

    const geometry = createDOMCursorGeometry(root);
    const pointForVerticalMovement = geometry.pointForVerticalMovement;
    if (pointForVerticalMovement === undefined) {
      throw new Error("Directional vertical geometry is unavailable.");
    }

    expect(
      pointForVerticalMovement(
        { path: "/root/children/1/children/0/text", offset: 0 },
        10,
        "up",
        "line",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
  });

  it("moves vertically between consecutive empty paragraphs", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/root/children/0">',
      '<span class="text-run" data-path="/root/children/0/children/0/text"></span>',
      "</p>",
      '<p class="paragraph-block text-block" data-path="/root/children/1">',
      '<span class="text-run" data-path="/root/children/1/children/0/text"></span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const first = root.querySelector('[data-path="/root/children/0"]');
    const second = root.querySelector('[data-path="/root/children/1"]');
    if (first === null || second === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(first, rect(10, 10, 120, 24));
    setRect(second, rect(10, 40, 120, 24));

    const geometry = createDOMCursorGeometry(root);
    const pointForVerticalMovement = geometry.pointForVerticalMovement;
    if (pointForVerticalMovement === undefined) {
      throw new Error("Directional vertical geometry is unavailable.");
    }

    expect(
      pointForVerticalMovement(
        { path: "/root/children/1/children/0/text", offset: 0 },
        10,
        "up",
        "line",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(
      pointForVerticalMovement(
        { path: "/root/children/0/children/0/text", offset: 0 },
        10,
        "down",
        "line",
      ),
    ).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
  });

  it("reports a page step from the root viewport height", () => {
    const root = setupRoot();
    setRect(root, rect(0, 0, 320, 240));

    expect(createDOMCursorGeometry(root).pageStep()).toBe(240);
  });

  it("returns null instead of inventing invalid points", () => {
    const root = document.createElement("div");
    root.innerHTML = '<p data-path="/root/children/0"></p>';
    document.body.append(root);
    const paragraph = root.querySelector("[data-path]");
    if (paragraph === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(paragraph, rect(10, 10, 100, 20));

    const geometry = createDOMCursorGeometry(root);

    expect(
      geometry.rectForPoint({ path: "/root/children/0", edge: "before" }),
    ).toBeNull();
    expect(geometry.pointFromCoordinates(20, 20)).toBeNull();
  });
});
