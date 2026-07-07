import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fixturesRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../tests/fixtures/clipboard-html-corpus",
);

type ClipboardCorpusManifest = {
  schema: string;
  issue: number;
  status: string;
  requiredSources: Array<{
    id: string;
    name: string;
    requiredShapes: string[];
  }>;
  requiredMimeTypes: string[];
  optionalMimeTypes: string[];
  samples: Array<{
    path: string;
    source: string;
    shape: string;
  }>;
};

describe("clipboard html corpus", () => {
  it("declares the issue #74 source matrix", () => {
    const manifest = readManifest();

    expect(manifest).toMatchObject({
      schema: "interactive-os.clipboard-html-corpus@1",
      issue: 74,
      status: "collecting",
      requiredMimeTypes: ["text/html", "text/plain"],
      optionalMimeTypes: ["text/markdown", "text/uri-list"],
    });
    expect(manifest.requiredSources.map((source) => source.id)).toEqual([
      "google-docs",
      "notion",
      "slack",
      "github-rendered",
      "generic-webpage",
    ]);
    expect(manifest.requiredSources.every((source) => source.requiredShapes.length > 0))
      .toBe(true);
  });

  it("validates any collected sample metadata", () => {
    const manifest = readManifest();
    const requiredShapesBySource = new Map(
      manifest.requiredSources.map((source) => [
        source.id,
        new Set(source.requiredShapes),
      ]),
    );

    for (const sample of manifest.samples) {
      expect(requiredShapesBySource.get(sample.source)?.has(sample.shape)).toBe(
        true,
      );
      const samplePath = join(fixturesRoot, sample.path);
      expect(existsSync(samplePath), sample.path).toBe(true);
      const payload = JSON.parse(readFileSync(samplePath, "utf8")) as {
        currentReaderExpectation?: unknown;
        futureHtmlImporterExpectation?: unknown;
        mime?: Record<string, string>;
        schema?: string;
        selectionShape?: string;
        source?: unknown;
      };

      expect(payload.schema).toBe("interactive-os.clipboard-html-sample@1");
      expect(payload.source).toEqual(expect.any(Object));
      expect(payload.selectionShape).toEqual(expect.any(String));
      expect(payload.mime?.["text/html"]).toEqual(expect.any(String));
      expect(payload.mime?.["text/plain"]).toEqual(expect.any(String));
      expect(payload.mime?.["text/html"].length).toBeGreaterThan(0);
      expect(payload.mime?.["text/plain"].length).toBeGreaterThan(0);
      expect(payload.currentReaderExpectation).toEqual(expect.any(Object));
      expect(payload.futureHtmlImporterExpectation).toEqual(expect.any(Object));
    }
  });
});

function readManifest(): ClipboardCorpusManifest {
  return JSON.parse(
    readFileSync(join(fixturesRoot, "manifest.json"), "utf8"),
  ) as ClipboardCorpusManifest;
}
