import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as publicEditor from "./index";

function publicFacadeTypeExports(): string[] {
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

describe("editor public facade", () => {
  it("keeps runtime exports to the headless editor and validation seam", () => {
    expect(Object.keys(publicEditor).sort()).toEqual([
      "createEditor",
      "parseNoteDocument",
    ]);
    expect(Object.hasOwn(publicEditor, "initialNoteDocument")).toBe(false);
    expect(Object.hasOwn(publicEditor, "createNoteDocument")).toBe(false);
    expect(Object.hasOwn(publicEditor, "NoteDocumentSchema")).toBe(false);
    expect(Object.hasOwn(publicEditor, "importMarkdown")).toBe(false);
    expect(Object.hasOwn(publicEditor, "exportMarkdown")).toBe(false);
    expect(Object.hasOwn(publicEditor, "exportInlineMarkdown")).toBe(false);
    expect(Object.hasOwn(publicEditor, "BlockEditor")).toBe(false);
  });

  it("keeps the source-level public type surface narrow", () => {
    expect(publicFacadeTypeExports()).toEqual([
      "CreateEditorOptions",
      "Editor",
      "EditorCapability",
      "EditorCommand",
      "EditorDeleteUnit",
      "EditorListener",
      "EditorMoveDirection",
      "EditorMoveUnit",
      "EditorQuery",
      "EditorQueryResult",
      "EditorResult",
      "EditorSnapshot",
      "EditorViewAdapter",
      "InsertableEditorNode",
      "Mark",
      "NoteDocument",
      "NoteDocumentParseResult",
      "RichSelection",
      "ToggleMarkCommandType",
    ]);
  });

  it("parses persisted documents without exposing demo constructors or Zod", () => {
    const validDocument = {
      schemaVersion: 1,
      id: "persisted-note",
      title: "Persisted note",
      tags: [],
      root: {
        id: "root",
        kind: "element",
        type: "doc",
        flow: "block",
        children: [
          {
            id: "block-1",
            type: "paragraph",
            children: [{ type: "text", text: "Stored text" }],
          },
        ],
      },
    };

    const parsed = publicEditor.parseNoteDocument(validDocument);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.document.root.children[0]?.kind : null).toBe(
      "element",
    );

    const invalid = publicEditor.parseNoteDocument({
      ...validDocument,
      schemaVersion: 2,
    });
    expect(invalid).toEqual({
      ok: false,
      reason: "Document is invalid.",
    });
  });

  it("boots the headless editor from parsed persisted documents", () => {
    const parsed = publicEditor.parseNoteDocument({
      schemaVersion: 1,
      id: "persisted-note",
      title: "Persisted note",
      tags: [],
      root: {
        id: "root",
        kind: "element",
        type: "doc",
        flow: "block",
        children: [
          {
            id: "block-1",
            type: "paragraph",
            children: [{ type: "text", text: "Stored text" }],
          },
        ],
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error("Expected parsed persisted document.");
    }

    const editor = publicEditor.createEditor({ initial: parsed.document });

    expect(editor.query({ type: "document" }).root.children[0]).toMatchObject({
      kind: "element",
      type: "paragraph",
      children: [{ kind: "text", type: "text", text: "Stored text" }],
    });
  });

  it("keeps parse failures generic instead of exposing schema issue details", () => {
    const invalid = publicEditor.parseNoteDocument({
      schemaVersion: 1,
      id: "",
      title: "Invalid note",
      tags: [],
      root: {
        id: "root",
        kind: "element",
        type: "doc",
        flow: "block",
        children: [],
      },
    });

    expect(invalid).toEqual({
      ok: false,
      reason: "Document is invalid.",
    });
  });

  it("validates persisted link mark hrefs without exposing schema details", () => {
    const documentWithLink = {
      schemaVersion: 1,
      id: "persisted-note",
      title: "Persisted note",
      tags: [],
      root: {
        id: "root",
        kind: "element",
        type: "doc",
        flow: "block",
        children: [
          {
            id: "block-1",
            type: "paragraph",
            children: [
              {
                type: "text",
                text: "Stored link",
                marks: [{ type: "link", href: "https://example.com" }],
              },
            ],
          },
        ],
      },
    };

    const parsed = publicEditor.parseNoteDocument(documentWithLink);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.document.root.children[0] : null).toMatchObject({
      type: "paragraph",
      children: [
        {
          type: "text",
          text: "Stored link",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ],
    });

    const invalid = publicEditor.parseNoteDocument({
      ...documentWithLink,
      root: {
        ...documentWithLink.root,
        children: [
          {
            id: "block-1",
            type: "paragraph",
            children: [
              {
                type: "text",
                text: "Empty link",
                marks: [{ type: "link", href: "" }],
              },
            ],
          },
        ],
      },
    });

    expect(invalid).toEqual({
      ok: false,
      reason: "Document is invalid.",
    });

    const unsafe = publicEditor.parseNoteDocument({
      ...documentWithLink,
      root: {
        ...documentWithLink.root,
        children: [
          {
            id: "block-1",
            type: "paragraph",
            children: [
              {
                type: "text",
                text: "Unsafe link",
                marks: [{ type: "link", href: "javascript:alert(1)" }],
              },
            ],
          },
        ],
      },
    });

    expect(unsafe).toEqual({
      ok: false,
      reason: "Document is invalid.",
    });
  });

  it("validates persisted figure sources without exposing schema details", () => {
    const documentWithFigure = {
      schemaVersion: 1,
      id: "persisted-note",
      title: "Persisted note",
      tags: [],
      root: {
        id: "root",
        kind: "element",
        type: "doc",
        flow: "block",
        children: [
          {
            id: "figure-1",
            kind: "atom",
            type: "figure",
            flow: "block",
            src: "/sample-figure.svg",
            alt: "Figure",
          },
        ],
      },
    };

    const parsed = publicEditor.parseNoteDocument(documentWithFigure);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.document.root.children[0] : null).toMatchObject({
      type: "figure",
      src: "/sample-figure.svg",
      alt: "Figure",
    });

    const unsafe = publicEditor.parseNoteDocument({
      ...documentWithFigure,
      root: {
        ...documentWithFigure.root,
        children: [
          {
            ...documentWithFigure.root.children[0],
            src: "data:image/png;base64,AAAA",
          },
        ],
      },
    });

    expect(unsafe).toEqual({
      ok: false,
      reason: "Document is invalid.",
    });
  });
});
