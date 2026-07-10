import { describe, expect, it } from "vitest";
import {
  accumulateNativeCompositionRange,
  diffText,
  diffTextNearRange,
} from "./textChange";

describe("text change mapping", () => {
  it("keeps the complete composition span as native preedit text grows", () => {
    const first = diffText("xy", "x한y");
    const second = diffText("x한y", "x한국y");
    if (first === null || second === null) {
      throw new Error("Expected native text changes.");
    }

    const initial = accumulateNativeCompositionRange(
      { from: 1, to: 1 },
      first,
      3,
    );

    expect(initial).toEqual({ from: 1, to: 2 });
    expect(accumulateNativeCompositionRange(initial, second, 4)).toEqual({
      from: 1,
      to: 3,
    });
  });

  it("uses the composition range to disambiguate repeated text", () => {
    expect(diffText("aaa", "aaaa")).toEqual({
      from: 3,
      to: 3,
      insert: "a",
    });
    expect(diffTextNearRange("aaa", "aaaa", { from: 1, to: 1 })).toEqual({
      from: 1,
      to: 1,
      insert: "a",
    });
  });
});
