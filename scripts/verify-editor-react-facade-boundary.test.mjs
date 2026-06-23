import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { verifyEditorBoundaries } from "./verify-editor-boundaries.mjs";

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
