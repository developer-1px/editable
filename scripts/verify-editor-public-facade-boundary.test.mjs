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
