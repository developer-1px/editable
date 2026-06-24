import { expect } from "vitest";
import type { CursorPoint } from "../../model/cursor";
import { rect, setRect } from "./cursorGeometryTestUtils";

export type InvariantFixture = {
  html: string[];
  rects: Record<string, DOMRect>;
  legalStops: Array<{ label: string; point: CursorPoint }>;
  rowStops: Array<{ label: string; point: CursorPoint; x: number }>;
};

export function setupInvariantFixture(fixture: InvariantFixture): Element {
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

export function textStops(label: string, path: string, text: string) {
  return Array.from({ length: text.length + 1 }, (_, offset) => ({
    label: `${label} offset ${offset}`,
    point: { path, offset } satisfies CursorPoint,
  }));
}

export function edgeStops(label: string, path: string) {
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

export function expectFiniteRect(label: string, value: DOMRect | null) {
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

export const invariantFixtures: Array<{
  name: string;
  fixture: InvariantFixture;
}> = [
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

export type GeneratedBlockKind =
  | "paragraph"
  | "empty"
  | "mention"
  | "figure"
  | "code"
  | "wrap";

export type GeneratedBlock = {
  html: string[];
  rects: Record<string, DOMRect>;
  legalStops: Array<{ label: string; point: CursorPoint }>;
  rowStops: Array<{ label: string; point: CursorPoint; x: number }>;
  height: number;
};

export function createGeneratedInvariantFixture(seed: number): {
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

export function createGeneratedBlock(
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

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export function pick<T>(items: T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) {
    throw new Error("Cannot pick from an empty list.");
  }

  return item;
}

export const generatedInvariantFixtures = Array.from(
  { length: 96 },
  (_, index) => createGeneratedInvariantFixture(index + 1),
);

export const allInvariantFixtures = [
  ...invariantFixtures,
  ...generatedInvariantFixtures,
];
