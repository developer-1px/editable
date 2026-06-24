import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { createEditor } from "./editorCore";
import { documentWithText } from "./editorCoreTestUtils";

function descriptorKeysFromSource(constName: string): string[] {
  const sourcePath = new URL("./editorCoreDescriptors.ts", import.meta.url);
  const sourceFile = ts.createSourceFile(
    "editorCoreDescriptors.ts",
    readFileSync(sourcePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === constName &&
        declaration.initializer !== undefined &&
        ts.isObjectLiteralExpression(declaration.initializer)
      ) {
        return declaration.initializer.properties
          .map((property) =>
            ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)
              ? property.name.text
              : null,
          )
          .filter((name): name is string => name !== null);
      }
    }
  }

  throw new Error(`Could not find ${constName} descriptor object.`);
}

describe("editor core public surface", () => {
  it("keeps the editor.xxx public surface minimal", () => {
    const editor = createEditor({ initial: documentWithText("A") });

    expect(Object.keys(editor).sort()).toEqual([
      "can",
      "dispatch",
      "dispose",
      "query",
      "snapshot",
      "subscribe",
    ]);
  });

  it("keeps the command descriptor registry closed", () => {
    expect(descriptorKeysFromSource("commandDescriptors")).toEqual([
      "setSelection",
      "selectAll",
      "moveSelection",
      "insertText",
      "insertNode",
      "delete",
      "split",
      "toggleMark",
      "undo",
      "redo",
      "replaceDocument",
    ]);
  });

  it("keeps the query descriptor registry closed", () => {
    expect(descriptorKeysFromSource("queryDescriptors")).toEqual([
      "document",
      "selection",
      "activeMarks",
      "canUndo",
      "canRedo",
      "can",
    ]);
  });
});
