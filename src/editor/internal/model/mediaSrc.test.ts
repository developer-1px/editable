import { describe, expect, it } from "vitest";
import { normalizeFigureSrc, renderableFigureSrc } from "./mediaSrc";

describe("figure media source policy", () => {
  it("allows relative and http image sources", () => {
    expect(normalizeFigureSrc(" /sample-figure.svg ")).toBe(
      "/sample-figure.svg",
    );
    expect(normalizeFigureSrc("./image.png")).toBe("./image.png");
    expect(normalizeFigureSrc("../image.png")).toBe("../image.png");
    expect(normalizeFigureSrc("https://example.com/image.png")).toBe(
      "https://example.com/image.png",
    );
    expect(normalizeFigureSrc("http://example.com/image.webp")).toBe(
      "http://example.com/image.webp",
    );
  });

  it("rejects active, opaque, protocol-relative, and external SVG sources", () => {
    for (const src of [
      "",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "blob:https://example.com/id",
      "//example.com/image.png",
      "\\\\example.com\\image.png",
      "https://example.com/image.svg",
      "https://example.com/image%2Esvg",
    ]) {
      expect(normalizeFigureSrc(src)).toBeNull();
      expect(renderableFigureSrc(src)).toBeUndefined();
    }
  });
});
