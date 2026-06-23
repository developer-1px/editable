import { describe, expect, it } from "vitest";

import { parseRepeat } from "./verify-internal.mjs";

describe("verify-internal repeat parsing", () => {
  it("uses the default repeat when no repeat argument is provided", () => {
    expect(parseRepeat([])).toBe(3);
  });

  it("uses the explicit positive repeat argument", () => {
    expect(parseRepeat(["--", "--repeat=10"])).toBe(10);
  });

  it.each([
    "--repeat=0",
    "--repeat=-1",
    "--repeat=2x",
    "--repeat=abc",
  ])("rejects invalid repeat argument %s", (repeatArg) => {
    expect(() => parseRepeat([repeatArg])).toThrow("Invalid --repeat value");
  });
});
