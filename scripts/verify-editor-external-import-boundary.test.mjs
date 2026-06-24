import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { verifyEditorBoundaries } from "./verify-editor-boundaries.mjs";

describe("verify-editor-boundaries external hidden import rules", () => {
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
});
