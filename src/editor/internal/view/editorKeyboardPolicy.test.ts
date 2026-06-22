import { describe, expect, it } from "vitest";
import { isHeadlessKeyDown } from "./editorKeyboardPolicy";

describe("isHeadlessKeyDown", () => {
  it("owns Tab, movement keys, and supported command shortcuts", () => {
    expect(
      isHeadlessKeyDown({
        altKey: false,
        ctrlKey: false,
        key: "Tab",
        metaKey: false,
      }),
    ).toBe(true);
    expect(
      isHeadlessKeyDown({
        altKey: false,
        ctrlKey: false,
        key: "ArrowRight",
        metaKey: false,
      }),
    ).toBe(true);
    expect(
      isHeadlessKeyDown(
        {
          altKey: false,
          ctrlKey: true,
          key: "k",
          metaKey: false,
        },
        "other",
      ),
    ).toBe(true);
    expect(
      isHeadlessKeyDown(
        {
          altKey: false,
          ctrlKey: false,
          key: "k",
          metaKey: true,
        },
        "mac",
      ),
    ).toBe(true);
  });

  it("owns structural editing keys with their supported modifiers", () => {
    expect(
      isHeadlessKeyDown({
        altKey: false,
        ctrlKey: false,
        key: "Backspace",
        metaKey: false,
      }),
    ).toBe(true);
    expect(
      isHeadlessKeyDown({
        altKey: true,
        ctrlKey: false,
        key: "Backspace",
        metaKey: false,
      }),
    ).toBe(true);
    expect(
      isHeadlessKeyDown({
        altKey: false,
        ctrlKey: false,
        key: "Delete",
        metaKey: false,
      }),
    ).toBe(true);
    expect(
      isHeadlessKeyDown({
        altKey: false,
        ctrlKey: false,
        key: "Enter",
        metaKey: false,
      }),
    ).toBe(true);
  });

  it("owns unsupported command structural shortcuts so native editing cannot run", () => {
    expect(
      isHeadlessKeyDown(
        {
          altKey: false,
          ctrlKey: false,
          key: "Backspace",
          metaKey: true,
        },
        "mac",
      ),
    ).toBe(true);
    expect(
      isHeadlessKeyDown(
        {
          altKey: false,
          ctrlKey: true,
          key: "Delete",
          metaKey: false,
        },
        "other",
      ),
    ).toBe(true);
    expect(
      isHeadlessKeyDown({
        altKey: true,
        ctrlKey: false,
        key: "Enter",
        metaKey: false,
      }),
    ).toBe(true);
  });

  it("owns macOS Ctrl-B/F/P/N as navigation keys", () => {
    for (const key of ["b", "f", "p", "n"]) {
      expect(
        isHeadlessKeyDown(
          {
            altKey: false,
            ctrlKey: true,
            key,
            metaKey: false,
          },
          "mac",
        ),
      ).toBe(true);
    }
  });

  it("passes browser/system shortcuts that are not editor commands through", () => {
    expect(
      isHeadlessKeyDown({
        altKey: false,
        ctrlKey: false,
        key: "x",
        metaKey: false,
      }),
    ).toBe(false);
    expect(
      isHeadlessKeyDown({
        altKey: false,
        ctrlKey: false,
        key: "F1",
        metaKey: false,
      }),
    ).toBe(false);
    expect(
      isHeadlessKeyDown({
        altKey: false,
        ctrlKey: true,
        key: "s",
        metaKey: false,
      }),
    ).toBe(false);
    expect(
      isHeadlessKeyDown(
        {
          altKey: false,
          ctrlKey: false,
          key: "u",
          metaKey: true,
        },
        "mac",
      ),
    ).toBe(false);
    expect(
      isHeadlessKeyDown({
        altKey: true,
        ctrlKey: false,
        key: "Tab",
        metaKey: false,
      }),
    ).toBe(false);
    expect(
      isHeadlessKeyDown(
        {
          altKey: false,
          ctrlKey: true,
          key: "b",
          metaKey: true,
        },
        "other",
      ),
    ).toBe(false);
    expect(
      isHeadlessKeyDown(
        {
          altKey: false,
          ctrlKey: true,
          key: "b",
          metaKey: false,
          shiftKey: true,
        },
        "other",
      ),
    ).toBe(false);
    expect(
      isHeadlessKeyDown(
        {
          altGraphKey: true,
          altKey: true,
          ctrlKey: true,
          key: "b",
          metaKey: false,
        },
        "other",
      ),
    ).toBe(false);
  });
});
