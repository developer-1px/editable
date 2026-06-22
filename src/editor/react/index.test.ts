import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as reactEditor from ".";

function reactFacadeTypeExports(): string[] {
  const sourcePath = new URL("./index.ts", import.meta.url);
  const sourceFile = ts.createSourceFile(
    "index.ts",
    readFileSync(sourcePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const typeExports: string[] = [];

  for (const statement of sourceFile.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (statement.isTypeOnly || element.isTypeOnly) {
          typeExports.push(element.name.text);
        }
      }
      continue;
    }

    if (
      (ts.isTypeAliasDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement)) &&
      statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      ) === true
    ) {
      typeExports.push(statement.name.text);
    }
  }

  return typeExports.sort();
}

describe("editor react facade", () => {
  it("keeps runtime exports to the React editor surface", () => {
    expect(Object.keys(reactEditor).sort()).toEqual(["BlockEditor"]);
    expect(Object.hasOwn(reactEditor, "createEditor")).toBe(false);
    expect(Object.hasOwn(reactEditor, "parseNoteDocument")).toBe(false);
  });

  it("keeps the source-level React type surface narrow", () => {
    expect(reactFacadeTypeExports()).toEqual(["BlockEditorProps"]);
  });
});
