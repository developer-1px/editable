import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  publicEditorFacadeViolations,
  verifyEditorBoundaries,
} from "./verify-editor-boundaries.mjs";

const publicFacadePath = "src/editor/public/index.ts";

function violationsFor(source) {
  return publicEditorFacadeViolations(publicFacadePath, source);
}

function publicFacadeBoundaryViolationsFor(source) {
  const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
  try {
    mkdirSync(join(root, "src/editor/public"), { recursive: true });
    writeFileSync(join(root, "src/editor/public/index.ts"), source);
    return verifyEditorBoundaries(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function reactFacadeViolationsFor(source) {
  const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
  try {
    mkdirSync(join(root, "src/editor/react"), { recursive: true });
    writeFileSync(join(root, "src/editor/react/index.ts"), source);
    return verifyEditorBoundaries(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

describe("verify-editor-boundaries public facade rules", () => {
  it("flags direct markdown adapter re-exports even when aliased", () => {
    expect(
      violationsFor(
        'export { importMarkdown as readMarkdown } from "../internal/model/markdown";',
      ),
    ).toEqual([
      expect.stringContaining(
        "exposes internal markdown adapter through public facade",
      ),
    ]);
  });

  it("flags imported markdown adapter bindings re-exported under another name", () => {
    expect(
      violationsFor(`
        import { importMarkdown as readMarkdown } from "../internal/model/markdown";
        export { readMarkdown as read };
      `),
    ).toEqual([
      expect.stringContaining(
        "exposes imported non-public editor helper: readMarkdown",
      ),
    ]);
  });

  it("flags imported internal helpers re-exported under another name", () => {
    expect(
      violationsFor(`
        import { NoteDocumentSchema as schema } from "../internal/model/noteDocument";
        export { schema as schemaContract };
      `),
    ).toEqual([
      expect.stringContaining(
        "exposes imported non-public editor helper: schema",
      ),
    ]);
  });

  it("flags direct named exports of arbitrary internal model helpers", () => {
    expect(
      violationsFor(`
        export { activeMarksFromSelection as readMarks } from "../internal/model/markCommands";
      `),
    ).toEqual([
      expect.stringContaining(
        "exposes non-public editor helper: activeMarksFromSelection",
      ),
    ]);
  });

  it("flags low-level selection snapshots exported through the public facade", () => {
    expect(
      publicFacadeBoundaryViolationsFor(
        'export type { SelectionSnap } from "@interactive-os/json-document";',
      ),
    ).toEqual([
      expect.stringContaining(
        "exposes non-public editor helper: SelectionSnap",
      ),
    ]);
  });

  it("flags arbitrary internal model helpers re-exported under another name", () => {
    expect(
      violationsFor(`
        import { activeMarksFromSelection as readMarks } from "../internal/model/markCommands";
        export { readMarks };
      `),
    ).toEqual([
      expect.stringContaining(
        "exposes imported non-public editor helper: readMarks",
      ),
    ]);
  });

  it("flags confirmed public headless bindings exported under another name", () => {
    expect(
      violationsFor(`
        export { createEditor as makeEditor } from "../internal/model/editorCore";
      `),
    ).toEqual([
      expect.stringContaining(
        "exposes public editor helper under non-public name: makeEditor",
      ),
    ]);
  });

  it("flags imported public headless bindings re-exported under another name", () => {
    expect(
      violationsFor(`
        import { createEditor as makeEditor } from "../internal/model/editorCore";
        export { makeEditor };
      `),
    ).toEqual([
      expect.stringContaining(
        "exposes public editor helper under non-public name: makeEditor",
      ),
    ]);
  });

  it("flags star exports from hidden editor implementation", () => {
    expect(
      violationsFor('export * from "../internal/model/noteDocument";'),
    ).toEqual([
      expect.stringContaining(
        "exposes internal editor implementation through public facade",
      ),
    ]);
  });

  it("flags namespace star exports from hidden editor implementation", () => {
    expect(
      violationsFor(
        'export * as editorCore from "../internal/model/editorCore";',
      ),
    ).toEqual([
      expect.stringContaining(
        "exposes internal editor implementation through public facade",
      ),
    ]);
  });

  it("flags namespace-imported internal helpers re-exported under another name", () => {
    expect(
      violationsFor(`
        import * as documentInternals from "../internal/model/noteDocument";
        export { documentInternals as noteDocument };
      `),
    ).toEqual([
      expect.stringContaining(
        "exposes imported non-public editor helper: documentInternals",
      ),
    ]);
  });

  it("allows aliased exports of confirmed public headless bindings", () => {
    expect(
      violationsFor(`
        import { createEditor as makeEditor } from "../internal/model/editorCore";
        export { makeEditor as createEditor };
      `),
    ).toEqual([]);
  });
});

describe("verify-editor-boundaries react facade rules", () => {
  it("reports react facade imports from the headless public facade", () => {
    expect(
      reactFacadeViolationsFor(
        'export { createEditor as makeEditor } from "../public";\n',
      ),
    ).toEqual([
      expect.stringContaining(
        "src/editor/react/index.ts exposes headless editor API through react facade",
      ),
      expect.stringContaining(
        "src/editor/react/index.ts mixes headless public facade into react facade",
      ),
    ]);
  });

  it("reports react facade exports of arbitrary React internals", () => {
    expect(
      reactFacadeViolationsFor(
        'export { EditorToolbar as Toolbar } from "../internal/react/EditorToolbar";\n',
      ),
    ).toEqual([
      expect.stringContaining(
        "src/editor/react/index.ts exposes non-public React helper through react facade",
      ),
    ]);
  });

  it("reports react facade exports of low-level selection snapshots", () => {
    expect(
      reactFacadeViolationsFor(
        'export type { SelectionSnap } from "@interactive-os/json-document";\n',
      ),
    ).toEqual([
      expect.stringContaining(
        "src/editor/react/index.ts exposes headless editor API through react facade: SelectionSnap",
      ),
    ]);
  });

  it("reports react facade exports of confirmed React bindings under another name", () => {
    expect(
      reactFacadeViolationsFor(
        'export { BlockEditor as EditorShell } from "../internal/react/BlockEditor";\n',
      ),
    ).toEqual([
      expect.stringContaining(
        "src/editor/react/index.ts exposes React helper under non-public name: EditorShell",
      ),
    ]);
  });

  it("reports star exports from internal React implementation", () => {
    expect(
      reactFacadeViolationsFor(
        'export * from "../internal/react/BlockEditor";\n',
      ),
    ).toEqual([
      expect.stringContaining(
        "src/editor/react/index.ts exposes internal React implementation through react facade",
      ),
    ]);
  });

  it("reports namespace star exports from internal React implementation", () => {
    expect(
      reactFacadeViolationsFor(
        'export * as ReactEditor from "../internal/react/BlockEditor";\n',
      ),
    ).toEqual([
      expect.stringContaining(
        "src/editor/react/index.ts exposes internal React implementation through react facade",
      ),
    ]);
  });

  it("reports react facade alias re-exports from non-react internals", () => {
    expect(
      reactFacadeViolationsFor(`
        import { createEditor as makeEditor } from "../internal/model/editorCore";
        export { makeEditor as useReactEditor };
      `),
    ).toEqual([
      expect.stringContaining(
        "src/editor/react/index.ts leaks non-react internals through react facade",
      ),
    ]);
  });

  it("reports imported React public bindings re-exported under another name", () => {
    expect(
      reactFacadeViolationsFor(`
        import { BlockEditor as EditorShell } from "../internal/react/BlockEditor";
        export { EditorShell };
      `),
    ).toEqual([
      expect.stringContaining(
        "src/editor/react/index.ts exposes React helper under non-public name: EditorShell",
      ),
    ]);
  });

  it("reports imported React internals re-exported under another name", () => {
    expect(
      reactFacadeViolationsFor(`
        import { EditorToolbar as Toolbar } from "../internal/react/EditorToolbar";
        export { Toolbar };
      `),
    ).toEqual([
      expect.stringContaining(
        "src/editor/react/index.ts exposes imported non-public React helper: Toolbar",
      ),
    ]);
  });
});

describe("verify-editor-boundaries internal segment rules", () => {
  it("reports static imports of hidden editor implementation from app source", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
    try {
      mkdirSync(join(root, "src/routes"), { recursive: true });
      mkdirSync(join(root, "src/editor/internal/model"), { recursive: true });
      writeFileSync(
        join(root, "src/routes/index.tsx"),
        'import { schema } from "../editor/internal/model/noteDocument";\nexport const route = schema;\n',
      );
      writeFileSync(
        join(root, "src/editor/internal/model/noteDocument.ts"),
        "export const schema = 1;\n",
      );

      expect(verifyEditorBoundaries(root)).toEqual([
        expect.stringContaining(
          "src/routes/index.tsx imports hidden editor implementation",
        ),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports export-from leaks of hidden editor implementation from app source", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
    try {
      mkdirSync(join(root, "src/routes"), { recursive: true });
      mkdirSync(join(root, "src/editor/internal/model"), { recursive: true });
      writeFileSync(
        join(root, "src/routes/index.ts"),
        'export { schema } from "../editor/internal/model/noteDocument";\n',
      );
      writeFileSync(
        join(root, "src/editor/internal/model/noteDocument.ts"),
        "export const schema = 1;\n",
      );

      expect(verifyEditorBoundaries(root)).toEqual([
        expect.stringContaining(
          "src/routes/index.ts imports hidden editor implementation",
        ),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports type-only imports of hidden editor implementation from app source", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
    try {
      mkdirSync(join(root, "src/routes"), { recursive: true });
      mkdirSync(join(root, "src/editor/internal/model"), { recursive: true });
      writeFileSync(
        join(root, "src/routes/index.ts"),
        'import type { NoteDocument } from "../editor/internal/model/noteDocument";\nexport type RouteDocument = NoteDocument;\n',
      );
      writeFileSync(
        join(root, "src/editor/internal/model/noteDocument.ts"),
        "export type NoteDocument = { id: string };\n",
      );

      expect(verifyEditorBoundaries(root)).toEqual([
        expect.stringContaining(
          "src/routes/index.ts imports hidden editor implementation",
        ),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports type import expressions of hidden editor implementation from app source", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
    try {
      mkdirSync(join(root, "src/routes"), { recursive: true });
      mkdirSync(join(root, "src/editor/internal/model"), { recursive: true });
      writeFileSync(
        join(root, "src/routes/index.ts"),
        'type HiddenDocument = import("../editor/internal/model/noteDocument").NoteDocument;\nexport type RouteDocument = HiddenDocument;\n',
      );
      writeFileSync(
        join(root, "src/editor/internal/model/noteDocument.ts"),
        "export type NoteDocument = { id: string };\n",
      );

      expect(verifyEditorBoundaries(root)).toEqual([
        expect.stringContaining(
          "src/routes/index.ts imports hidden editor implementation",
        ),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports legacy editor tree imports from app source", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
    try {
      mkdirSync(join(root, "src/routes"), { recursive: true });
      mkdirSync(join(root, "src/editor/model"), { recursive: true });
      writeFileSync(
        join(root, "src/routes/index.tsx"),
        'import { schema } from "../editor/model/noteDocument";\nexport const route = schema;\n',
      );
      writeFileSync(
        join(root, "src/editor/model/noteDocument.ts"),
        "export const schema = 1;\n",
      );

      expect(verifyEditorBoundaries(root)).toEqual([
        expect.stringContaining(
          "src/routes/index.tsx imports hidden editor implementation",
        ),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports dynamic imports of hidden editor implementation", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
    try {
      mkdirSync(join(root, "src/routes"), { recursive: true });
      mkdirSync(join(root, "src/editor/internal/model"), { recursive: true });
      writeFileSync(
        join(root, "src/routes/index.tsx"),
        'export async function loadEditorInternals() {\n  return import("../editor/internal/model/noteDocument");\n}\n',
      );
      writeFileSync(
        join(root, "src/editor/internal/model/noteDocument.ts"),
        "export const schema = 1;\n",
      );

      expect(verifyEditorBoundaries(root)).toEqual([
        expect.stringContaining(
          "src/routes/index.tsx imports hidden editor implementation",
        ),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports commented dynamic imports of hidden editor implementation", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
    try {
      mkdirSync(join(root, "src/routes"), { recursive: true });
      mkdirSync(join(root, "src/editor/internal/model"), { recursive: true });
      writeFileSync(
        join(root, "src/routes/index.tsx"),
        'export async function loadEditorInternals() {\n  return import(/* @vite-ignore */ "../editor/internal/model/noteDocument");\n}\n',
      );
      writeFileSync(
        join(root, "src/editor/internal/model/noteDocument.ts"),
        "export const schema = 1;\n",
      );

      expect(verifyEditorBoundaries(root)).toEqual([
        expect.stringContaining(
          "src/routes/index.tsx imports hidden editor implementation",
        ),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports TypeScript import-equals require of hidden editor implementation", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
    try {
      mkdirSync(join(root, "src/routes"), { recursive: true });
      mkdirSync(join(root, "src/editor/internal/model"), { recursive: true });
      writeFileSync(
        join(root, "src/routes/index.ts"),
        'import internals = require("../editor/internal/model/noteDocument");\nexport const route = internals.schema;\n',
      );
      writeFileSync(
        join(root, "src/editor/internal/model/noteDocument.ts"),
        "export const schema = 1;\n",
      );

      expect(verifyEditorBoundaries(root)).toEqual([
        expect.stringContaining(
          "src/routes/index.ts imports hidden editor implementation",
        ),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports require calls to hidden editor implementation", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
    try {
      mkdirSync(join(root, "src/routes"), { recursive: true });
      mkdirSync(join(root, "src/editor/internal/model"), { recursive: true });
      writeFileSync(
        join(root, "src/routes/index.tsx"),
        'export const internals = require("../editor/internal/model/noteDocument");\n',
      );
      writeFileSync(
        join(root, "src/editor/internal/model/noteDocument.ts"),
        "export const schema = 1;\n",
      );

      expect(verifyEditorBoundaries(root)).toEqual([
        expect.stringContaining(
          "src/routes/index.tsx imports hidden editor implementation",
        ),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports Vite glob imports of hidden editor implementation", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
    try {
      mkdirSync(join(root, "src/routes"), { recursive: true });
      mkdirSync(join(root, "src/editor/internal/model"), { recursive: true });
      writeFileSync(
        join(root, "src/routes/index.tsx"),
        'export const internals = import.meta.glob("../editor/internal/model/*.ts");\n',
      );
      writeFileSync(
        join(root, "src/editor/internal/model/noteDocument.ts"),
        "export const schema = 1;\n",
      );

      expect(verifyEditorBoundaries(root)).toEqual([
        expect.stringContaining(
          "src/routes/index.tsx imports hidden editor implementation",
        ),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports Vite eager glob imports of hidden editor implementation", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
    try {
      mkdirSync(join(root, "src/routes"), { recursive: true });
      mkdirSync(join(root, "src/editor/internal/model"), { recursive: true });
      writeFileSync(
        join(root, "src/routes/index.tsx"),
        'export const internals = import.meta.glob("../editor/internal/model/*.ts", { eager: true });\n',
      );
      writeFileSync(
        join(root, "src/editor/internal/model/noteDocument.ts"),
        "export const schema = 1;\n",
      );

      expect(verifyEditorBoundaries(root)).toEqual([
        expect.stringContaining(
          "src/routes/index.tsx imports hidden editor implementation",
        ),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports Vite glob array imports of hidden editor implementation", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
    try {
      mkdirSync(join(root, "src/routes"), { recursive: true });
      mkdirSync(join(root, "src/editor/public"), { recursive: true });
      mkdirSync(join(root, "src/editor/internal/model"), { recursive: true });
      writeFileSync(
        join(root, "src/routes/index.tsx"),
        [
          "export const editorModules = import.meta.glob([",
          '  "../editor/public/*.ts",',
          '  "../editor/internal/model/*.ts",',
          "]);",
          "",
        ].join("\n"),
      );
      writeFileSync(join(root, "src/editor/public/index.ts"), "\n");
      writeFileSync(
        join(root, "src/editor/internal/model/noteDocument.ts"),
        "export const schema = 1;\n",
      );

      expect(verifyEditorBoundaries(root)).toEqual([
        expect.stringContaining(
          "src/routes/index.tsx imports hidden editor implementation",
        ),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports model imports from host-specific internal segments", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
    try {
      mkdirSync(join(root, "src/editor/internal/model"), { recursive: true });
      mkdirSync(join(root, "src/editor/internal/view"), { recursive: true });
      writeFileSync(
        join(root, "src/editor/internal/model/foo.ts"),
        'import { viewThing } from "../view/bar";\nexport const modelThing = viewThing;\n',
      );
      writeFileSync(
        join(root, "src/editor/internal/view/bar.ts"),
        "export const viewThing = 1;\n",
      );

      expect(verifyEditorBoundaries(root)).toEqual([
        expect.stringContaining(
          "src/editor/internal/model/foo.ts imports non-model editor internal segment",
        ),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports runtime imports of test-only internal helpers and fixtures", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
    try {
      mkdirSync(join(root, "src/editor/internal/react"), { recursive: true });
      mkdirSync(join(root, "src/editor/internal/testing"), { recursive: true });
      mkdirSync(join(root, "src/editor/internal/fixtures/ime"), {
        recursive: true,
      });
      writeFileSync(
        join(root, "src/editor/internal/react/runtime.ts"),
        [
          'import { replay } from "../testing/editorTraceReplay";',
          'import { trace } from "../fixtures/ime/koreanHangulBasicTrace";',
          "export const runtime = [replay, trace];",
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(root, "src/editor/internal/testing/editorTraceReplay.ts"),
        "export const replay = 1;\n",
      );
      writeFileSync(
        join(
          root,
          "src/editor/internal/fixtures/ime/koreanHangulBasicTrace.ts",
        ),
        "export const trace = 1;\n",
      );

      expect(verifyEditorBoundaries(root)).toEqual([
        expect.stringContaining(
          "src/editor/internal/react/runtime.ts imports test-only editor testing",
        ),
        expect.stringContaining(
          "src/editor/internal/react/runtime.ts imports test-only editor fixtures",
        ),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("allows test files to import test-only internal helpers and fixtures", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
    try {
      mkdirSync(join(root, "src/editor/internal/react"), { recursive: true });
      mkdirSync(join(root, "src/editor/internal/testing"), { recursive: true });
      mkdirSync(join(root, "src/editor/internal/fixtures/ime"), {
        recursive: true,
      });
      writeFileSync(
        join(root, "src/editor/internal/react/runtime.test.ts"),
        [
          'import { replay } from "../testing/editorTraceReplay";',
          'import { trace } from "../fixtures/ime/koreanHangulBasicTrace";',
          "export const regression = [replay, trace];",
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(root, "src/editor/internal/testing/editorTraceReplay.ts"),
        "export const replay = 1;\n",
      );
      writeFileSync(
        join(
          root,
          "src/editor/internal/fixtures/ime/koreanHangulBasicTrace.ts",
        ),
        "export const trace = 1;\n",
      );

      expect(verifyEditorBoundaries(root)).toEqual([]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports test helpers importing editor implementation segments", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
    try {
      mkdirSync(join(root, "src/editor/internal/testing"), { recursive: true });
      mkdirSync(join(root, "src/editor/internal/model"), { recursive: true });
      writeFileSync(
        join(root, "src/editor/internal/testing/editorTraceReplay.ts"),
        'import { createEditor } from "../model/editorCore";\nexport const replay = createEditor;\n',
      );
      writeFileSync(
        join(root, "src/editor/internal/model/editorCore.ts"),
        "export const createEditor = 1;\n",
      );

      expect(verifyEditorBoundaries(root)).toEqual([
        expect.stringContaining(
          "src/editor/internal/testing/editorTraceReplay.ts imports editor implementation from test helper",
        ),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports fixtures importing non-testing internal segments", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-boundaries-"));
    try {
      mkdirSync(join(root, "src/editor/internal/fixtures/ime"), {
        recursive: true,
      });
      mkdirSync(join(root, "src/editor/internal/model"), { recursive: true });
      writeFileSync(
        join(root, "src/editor/internal/fixtures/ime/koreanTrace.ts"),
        'import { createEditor } from "../../model/editorCore";\nexport const trace = createEditor;\n',
      );
      writeFileSync(
        join(root, "src/editor/internal/model/editorCore.ts"),
        "export const createEditor = 1;\n",
      );

      expect(verifyEditorBoundaries(root)).toEqual([
        expect.stringContaining(
          "src/editor/internal/fixtures/ime/koreanTrace.ts imports non-testing editor internal segment from fixture",
        ),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
