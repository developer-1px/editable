import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyDocsInventory } from "./verify-docs-inventory.mjs";

describe("verify-docs-inventory", () => {
  it("accepts README Docs entries that match docs files", () => {
    withDocsFixture(
      ["docs/a.md", "docs/b.md"],
      "# Test\n\n## Docs\n\n- `docs/a.md`: A\n- [B](docs/b.md)\n",
      (root) => {
        const result = verifyDocsInventory(root);

        expect(result.docsFiles).toEqual(["docs/a.md", "docs/b.md"]);
        expect(result.readmeDocs).toEqual(["docs/a.md", "docs/b.md"]);
        expect(result.violations).toEqual([]);
      },
    );
  });

  it("reports docs files missing from README Docs", () => {
    withDocsFixture(
      ["docs/a.md", "docs/b.md"],
      "# Test\n\n## Docs\n\n- `docs/a.md`: A\n",
      (root) => {
        const result = verifyDocsInventory(root);

        expect(result.missingFromReadme).toEqual(["docs/b.md"]);
        expect(result.violations).toContain(
          "Missing from README Docs: docs/b.md",
        );
      },
    );
  });

  it("reports README Docs entries without docs files", () => {
    withDocsFixture(
      ["docs/a.md"],
      "# Test\n\n## Docs\n\n- `docs/missing.md`\n",
      (root) => {
        const result = verifyDocsInventory(root);

        expect(result.staleReadmeLinks).toEqual(["docs/missing.md"]);
        expect(result.violations).toContain(
          "README Docs link without file: docs/missing.md",
        );
      },
    );
  });

  it("reports duplicate README Docs entries", () => {
    withDocsFixture(
      ["docs/a.md"],
      "# Test\n\n## Docs\n\n- `docs/a.md`: A\n- [A again](docs/a.md)\n",
      (root) => {
        const result = verifyDocsInventory(root);

        expect(result.duplicateReadmeLinks).toEqual(["docs/a.md"]);
        expect(result.violations).toContain(
          "Duplicate README Docs link: docs/a.md",
        );
      },
    );
  });

  it("requires editor docs to declare evidence strength", () => {
    withDocsFixture(
      ["docs/editor-audit.md"],
      "# Test\n\n## Docs\n\n- `docs/editor-audit.md`: Audit\n",
      (root) => {
        const result = verifyDocsInventory(root);

        expect(result.editorDocs).toEqual(["docs/editor-audit.md"]);
        expect(result.editorDocsMissingEvidence).toEqual([
          "docs/editor-audit.md",
        ]);
        expect(result.violations).toContain(
          "Missing editor evidence section: docs/editor-audit.md",
        );
      },
    );
  });

  it("accepts editor docs with evidence strength sections", () => {
    withDocsFixture(
      ["docs/editor-audit.md"],
      "# Test\n\n## Docs\n\n- `docs/editor-audit.md`: Audit\n",
      (root) => {
        const result = verifyDocsInventory(root);

        expect(result.editorDocs).toEqual(["docs/editor-audit.md"]);
        expect(result.editorDocsMissingEvidence).toEqual([]);
        expect(result.violations).toEqual([]);
      },
      {
        "docs/editor-audit.md":
          "# Editor Audit\n\n## 증거 강도\n\n| 항목 | 강도 | 이유 |\n",
      },
    );
  });

  it("does not require evidence strength sections for non-editor docs", () => {
    withDocsFixture(
      ["docs/rich-model-design.md"],
      "# Test\n\n## Docs\n\n- `docs/rich-model-design.md`: Design\n",
      (root) => {
        const result = verifyDocsInventory(root);

        expect(result.editorDocs).toEqual([]);
        expect(result.editorDocsMissingEvidence).toEqual([]);
        expect(result.violations).toEqual([]);
      },
    );
  });

  it("reports a missing README Docs section", () => {
    withDocsFixture(["docs/a.md"], "# Test\n\nNo docs section.\n", (root) => {
      expect(verifyDocsInventory(root).violations).toEqual([
        "README.md is missing a ## Docs section.",
      ]);
    });
  });
});

function withDocsFixture(docsFiles, readme, run, docsContentByPath = {}) {
  const root = mkdtempSync(join(tmpdir(), "verify-docs-inventory-"));
  try {
    mkdirSync(join(root, "docs"));
    for (const path of docsFiles) {
      writeFileSync(join(root, path), docsContentByPath[path] ?? "# fixture\n");
    }
    writeFileSync(join(root, "README.md"), readme);
    run(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}
