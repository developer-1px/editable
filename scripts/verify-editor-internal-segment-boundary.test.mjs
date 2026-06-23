import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { verifyEditorBoundaries } from "./verify-editor-boundaries.mjs";

describe("verify-editor-boundaries internal segment rules", () => {
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
