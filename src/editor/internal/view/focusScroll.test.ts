// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { focusElementPreservingScroll } from "./focusScroll";

describe("focusScroll", () => {
  it("focuses an element with preventScroll while restoring nested scroll positions", () => {
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    const editor = document.createElement("div");
    editor.tabIndex = 0;
    outer.append(inner);
    inner.append(editor);
    document.body.append(outer);
    outer.scrollTop = 120;
    outer.scrollLeft = 12;
    inner.scrollTop = 80;
    inner.scrollLeft = 8;

    let focusOptions: FocusOptions | undefined;
    const nativeFocus = HTMLElement.prototype.focus;
    Object.defineProperty(editor, "focus", {
      configurable: true,
      value: (options?: FocusOptions) => {
        focusOptions = options;
        outer.scrollTop = 0;
        outer.scrollLeft = 0;
        inner.scrollTop = 0;
        inner.scrollLeft = 0;
        nativeFocus.call(editor);
      },
    });

    expect(focusElementPreservingScroll(editor)).toBe(true);

    expect(focusOptions).toEqual({ preventScroll: true });
    expect(document.activeElement).toBe(editor);
    expect(outer.scrollTop).toBe(120);
    expect(outer.scrollLeft).toBe(12);
    expect(inner.scrollTop).toBe(80);
    expect(inner.scrollLeft).toBe(8);
  });

  it("falls back to plain focus when focus options throw", () => {
    const editor = document.createElement("div");
    editor.tabIndex = 0;
    document.body.append(editor);
    const nativeFocus = HTMLElement.prototype.focus;
    Object.defineProperty(editor, "focus", {
      configurable: true,
      value: (options?: FocusOptions) => {
        if (options !== undefined) {
          throw new TypeError("focus options unsupported");
        }
        nativeFocus.call(editor);
      },
    });

    expect(focusElementPreservingScroll(editor)).toBe(true);
    expect(document.activeElement).toBe(editor);
  });
});
