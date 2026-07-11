import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditEditableLayers,
  validateEditableLayerImport,
} from "./check-editable-layers.mjs";

describe("editable layer rules", () => {
  it.each([
    {
      name: "outside consumer through package facade",
      importerLayer: "outside",
      target: "packages/editable/index.ts",
      targetLayer: "public",
    },
    {
      name: "public through browser seam",
      importerLayer: "public",
      target: "packages/editable/browser/index.ts",
      targetLayer: "browser",
    },
    {
      name: "browser peer",
      importerLayer: "browser",
      target: "packages/editable/browser/editableDOM.ts",
      targetLayer: "browser",
    },
    {
      name: "browser through core seam",
      importerLayer: "browser",
      target: "packages/editable/core/index.ts",
      targetLayer: "core",
    },
    {
      name: "core peer",
      importerLayer: "core",
      target: "packages/editable/core/model.ts",
      targetLayer: "core",
    },
  ])("allows $name", ({ importerLayer, target, targetLayer }) => {
    expect(
      validateEditableLayerImport({ importerLayer, target, targetLayer }),
    ).toBeNull();
  });

  it.each([
    {
      code: "outside-deep-import",
      importerLayer: "outside",
      target: "packages/editable/browser/index.ts",
      targetLayer: "browser",
    },
    {
      code: "public-peer-import",
      importerLayer: "public",
      target: "packages/editable/model.ts",
      targetLayer: "public",
    },
    {
      code: "public-browser-bypass",
      importerLayer: "public",
      target: "packages/editable/browser/editor.ts",
      targetLayer: "browser",
    },
    {
      code: "public-grandchild-import",
      importerLayer: "public",
      target: "packages/editable/core/index.ts",
      targetLayer: "core",
    },
    {
      code: "browser-core-bypass",
      importerLayer: "browser",
      target: "packages/editable/core/model.ts",
      targetLayer: "core",
    },
    {
      code: "browser-upward-import",
      importerLayer: "browser",
      target: "packages/editable/index.ts",
      targetLayer: "public",
    },
    {
      code: "core-upward-import",
      importerLayer: "core",
      target: "packages/editable/browser/index.ts",
      targetLayer: "browser",
    },
  ])("rejects $code", ({ code, importerLayer, target, targetLayer }) => {
    expect(
      validateEditableLayerImport({ importerLayer, target, targetLayer }),
    ).toMatchObject({ code });
  });

  it("keeps the repository on declared seams", () => {
    expect(auditEditableLayers().violations).toEqual([]);
  });

  it("detects a type-only browser bypass through the real resolver", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "editable-layers-"));
    try {
      writeFixture(root, "tsconfig.json", {
        compilerOptions: { moduleResolution: "bundler" },
      });
      writeFixture(
        root,
        "packages/editable/index.ts",
        'export * from "./browser";\n',
      );
      writeFixture(
        root,
        "packages/editable/browser/index.ts",
        'export type { Value } from "../core";\n',
      );
      writeFixture(
        root,
        "packages/editable/browser/bypass.ts",
        'import type { Value } from "../core/model";\n',
      );
      writeFixture(
        root,
        "packages/editable/browser/absolute.ts",
        'import value from "/packages/editable/core/model.ts?raw";\n',
      );
      writeFixture(
        root,
        "packages/editable/browser/dynamic.ts",
        'const target = "../core/model";\nvoid import(target);\n',
      );
      writeFixture(
        root,
        "packages/editable/browser/query.ts",
        'import value from "../core/model.ts?raw";\n',
      );
      writeFixture(
        root,
        "packages/editable/browser/reference.ts",
        '/// <reference path="../core/model.ts" />\n',
      );
      writeFixture(
        root,
        "packages/editable/core/index.ts",
        'export type { Value } from "./model";\n',
      );
      writeFixture(
        root,
        "packages/editable/core/model.ts",
        "export type Value = string;\n",
      );
      writeFixture(
        root,
        "packages/editable/public.spec.ts",
        'import "./index";\n',
      );
      writeFixture(
        root,
        "packages/editable/__tests__/public.ts",
        'import "../index";\n',
      );

      expect(auditEditableLayers({ root }).violations).toEqual([
        expect.objectContaining({
          code: "browser-core-bypass",
          importer: "packages/editable/browser/absolute.ts",
          target: "packages/editable/core/model.ts",
        }),
        expect.objectContaining({
          code: "browser-core-bypass",
          importer: "packages/editable/browser/bypass.ts",
          target: "packages/editable/core/model.ts",
        }),
        expect.objectContaining({
          code: "nonliteral-dynamic-import",
          importer: "packages/editable/browser/dynamic.ts",
          target: "<dynamic>",
        }),
        expect.objectContaining({
          code: "browser-core-bypass",
          importer: "packages/editable/browser/query.ts",
          target: "packages/editable/core/model.ts",
        }),
        expect.objectContaining({
          code: "browser-core-bypass",
          importer: "packages/editable/browser/reference.ts",
          target: "packages/editable/core/model.ts",
        }),
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("closes dynamic, package-alias, and symlink boundary bypasses", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "editable-layers-"));
    try {
      writeFixture(root, "package.json", {
        imports: { "#core-model": "./packages/editable/core/model.ts" },
      });
      writeFixture(root, "tsconfig.json", {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "bundler",
        },
      });
      writeFixture(
        root,
        "packages/editable/index.ts",
        'export * from "./browser";\n',
      );
      writeFixture(
        root,
        "packages/editable/browser/index.ts",
        'export * from "../core";\n',
      );
      writeFixture(
        root,
        "packages/editable/browser/editor.ts",
        "export const editor = true;\n",
      );
      writeFixture(
        root,
        "packages/editable/core/index.ts",
        'export * from "./model";\n',
      );
      writeFixture(
        root,
        "packages/editable/core/model.ts",
        "export const model = true;\n",
      );
      fs.symlinkSync(
        path.join(root, "packages/editable/core/model.ts"),
        path.join(root, "packages/editable/browser/coreAlias.ts"),
        "file",
      );
      writeFixture(
        root,
        "packages/editable/browser/useCoreAlias.ts",
        'import "./coreAlias";\n',
      );
      writeFixture(root, "shared/external.ts", "export const shared = true;\n");
      fs.symlinkSync(
        path.join(root, "shared/external.ts"),
        path.join(root, "packages/editable/browser/externalAlias.ts"),
        "file",
      );
      writeFixture(
        root,
        "packages/editable/browser/useExternalAlias.ts",
        'import "./externalAlias";\n',
      );
      writeFixture(
        root,
        "packages/editable/public.spec.ts",
        'const target = "./browser/editor";\nvoid import(target);\n',
      );
      writeFixture(
        root,
        "src/dynamic.ts",
        'const target = "../packages/editable/browser/editor";\nvoid import(target);\n',
      );
      writeFixture(root, "src/packageAlias.ts", 'import "#core-model?raw";\n');
      writeFixture(
        root,
        "src/dynamic-require.cjs",
        'const target = "../packages/editable/core/model";\nrequire(target);\n',
      );
      fs.symlinkSync(
        path.join(root, "packages/editable"),
        path.join(root, "editable-alias"),
        "dir",
      );
      writeFixture(
        root,
        "src/symlink.ts",
        'import "../editable-alias/browser/editor";\n',
      );

      expect(auditEditableLayers({ root }).violations).toEqual([
        expect.objectContaining({
          code: "source-symlink",
          importer: "editable-alias",
          target: "editable-alias",
        }),
        expect.objectContaining({
          code: "source-symlink",
          importer: "packages/editable/browser/coreAlias.ts",
          target: "packages/editable/browser/coreAlias.ts",
        }),
        expect.objectContaining({
          code: "source-symlink",
          importer: "packages/editable/browser/externalAlias.ts",
          target: "packages/editable/browser/externalAlias.ts",
        }),
        expect.objectContaining({
          code: "browser-core-bypass",
          importer: "packages/editable/browser/useCoreAlias.ts",
          target: "packages/editable/core/model.ts",
        }),
        expect.objectContaining({
          code: "editable-symlink-escape",
          importer: "packages/editable/browser/useExternalAlias.ts",
          target: "shared/external.ts",
        }),
        expect.objectContaining({
          code: "nonliteral-dynamic-import",
          importer: "packages/editable/public.spec.ts",
          target: "<dynamic>",
        }),
        expect.objectContaining({
          code: "nonliteral-dynamic-import",
          importer: "src/dynamic-require.cjs",
          target: "<dynamic>",
        }),
        expect.objectContaining({
          code: "nonliteral-dynamic-import",
          importer: "src/dynamic.ts",
          target: "<dynamic>",
        }),
        expect.objectContaining({
          code: "outside-deep-import",
          importer: "src/packageAlias.ts",
          target: "packages/editable/core/model.ts",
        }),
        expect.objectContaining({
          code: "outside-deep-import",
          importer: "src/symlink.ts",
          target: "packages/editable/browser/editor.ts",
        }),
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects alternate CJS and Vite loaders without duplicate direct-require diagnostics", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "editable-layers-"));
    try {
      writeFixture(root, "package.json", {
        type: "module",
        imports: { "#loader": "module" },
      });
      writeFixture(root, "tsconfig.json", {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "bundler",
        },
      });
      writeFixture(
        root,
        "packages/editable/index.ts",
        'export * from "./browser";\n',
      );
      writeFixture(
        root,
        "packages/editable/browser/index.ts",
        "export const browser = true;\n",
      );
      writeFixture(
        root,
        "packages/editable/browser/hidden.cjs",
        "module.exports = true;\n",
      );
      writeFixture(
        root,
        "packages/editable/browser/module-require.cjs",
        'module.require("../core/hidden.cjs");\n',
      );
      writeFixture(
        root,
        "packages/editable/browser/globEager.ts",
        'import.meta.globEager("../core/*.ts");\n',
      );
      writeFixture(
        root,
        "packages/editable/core/index.ts",
        "export const core = true;\n",
      );
      writeFixture(
        root,
        "packages/editable/core/hidden.cjs",
        "module.exports = true;\n",
      );
      writeFixture(
        root,
        "src/direct-require.cjs",
        'require("../packages/editable/browser/hidden.cjs");\n',
      );
      writeFixture(
        root,
        "src/module-require.cjs",
        'module.require("../packages/editable/browser/hidden.cjs");\n',
      );
      writeFixture(
        root,
        "src/module-require-dynamic.cjs",
        'const target = "../packages/editable/browser/hidden.cjs";\nmodule.require(target);\n',
      );
      writeFixture(
        root,
        "src/require-alias.cjs",
        'const load = require;\nload("../packages/editable/browser/hidden.cjs");\n',
      );
      writeFixture(
        root,
        "src/module-require-alias.cjs",
        'const load = module.require;\nload("../packages/editable/browser/hidden.cjs");\n',
      );
      writeFixture(
        root,
        "src/glob.ts",
        'import.meta.glob("../packages/editable/browser/*.ts");\n',
      );
      writeFixture(
        root,
        "src/create-require.mjs",
        'import { createRequire as make } from "node:module";\nconst load = make(import.meta.url);\nload("../packages/editable/browser/hidden.cjs");\n',
      );
      writeFixture(
        root,
        "src/create-require-cjs.cjs",
        'const Module = require("module");\nconst load = Module.createRequire(__filename);\nload("../packages/editable/browser/hidden.cjs");\n',
      );
      writeFixture(
        root,
        "src/create-require-dynamic.mjs",
        'const Module = await import("node:module");\nconst load = Module.createRequire(import.meta.url);\nload("../packages/editable/browser/hidden.cjs");\n',
      );
      writeFixture(
        root,
        "src/create-require-package-alias.mjs",
        'import { createRequire } from "#loader";\nconst load = createRequire(import.meta.url);\nload("../packages/editable/browser/hidden.cjs");\n',
      );

      const violations = auditEditableLayers({ root }).violations;
      expect(violations).toHaveLength(12);
      expect(violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "import-meta-glob",
            importer: "packages/editable/browser/globEager.ts",
            target: "<import.meta.globEager>",
          }),
          expect.objectContaining({
            code: "browser-core-bypass",
            importer: "packages/editable/browser/module-require.cjs",
            target: "packages/editable/core/hidden.cjs",
          }),
          expect.objectContaining({
            code: "outside-deep-import",
            importer: "src/direct-require.cjs",
            target: "packages/editable/browser/hidden.cjs",
          }),
          expect.objectContaining({
            code: "node-module-loader",
            importer: "src/create-require-cjs.cjs",
            target: "<node:module>",
          }),
          expect.objectContaining({
            code: "node-module-loader",
            importer: "src/create-require-dynamic.mjs",
            target: "<node:module>",
          }),
          expect.objectContaining({
            code: "node-module-loader",
            importer: "src/create-require.mjs",
            target: "<node:module>",
          }),
          expect.objectContaining({
            code: "unresolved-package-import",
            importer: "src/create-require-package-alias.mjs",
            target: "#loader",
          }),
          expect.objectContaining({
            code: "import-meta-glob",
            importer: "src/glob.ts",
            target: "<import.meta.glob>",
          }),
          expect.objectContaining({
            code: "require-function-alias",
            importer: "src/module-require-alias.cjs",
            target: "<require function>",
          }),
          expect.objectContaining({
            code: "nonliteral-dynamic-import",
            importer: "src/module-require-dynamic.cjs",
            target: "<dynamic>",
          }),
          expect.objectContaining({
            code: "outside-deep-import",
            importer: "src/module-require.cjs",
            target: "packages/editable/browser/hidden.cjs",
          }),
          expect.objectContaining({
            code: "require-function-alias",
            importer: "src/require-alias.cjs",
            target: "<require function>",
          }),
        ]),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

function writeFixture(root, relativePath, contents) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    typeof contents === "string" ? contents : JSON.stringify(contents),
  );
}
