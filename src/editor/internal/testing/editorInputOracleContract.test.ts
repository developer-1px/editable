import { describe, expect, it } from "vitest";
import { koreanHangulActiveMarkTrace } from "../fixtures/ime/koreanHangulActiveMarkTrace";
import {
  koreanHangulAdjacentStaleFinishTrace,
  koreanHangulAdjacentStaleStartTrace,
} from "../fixtures/ime/koreanHangulAdjacentStaleTrace";
import { koreanHangulBasicTrace } from "../fixtures/ime/koreanHangulBasicTrace";
import { koreanHangulCompositionBlurTrace } from "../fixtures/ime/koreanHangulCompositionBlurTrace";
import { koreanHangulCompositionHistoryTrace } from "../fixtures/ime/koreanHangulCompositionHistoryTrace";
import { koreanHangulEnterConfirmTrace } from "../fixtures/ime/koreanHangulEnterConfirmTrace";
import { p0SelectionDeletionClipboardTraces } from "../fixtures/input/p0SelectionDeletionClipboardTrace";
import type {
  EditorInputContractId,
  EditorTraceReplay,
} from "./editorTraceReplay";

const imeTraces = [
  koreanHangulActiveMarkTrace,
  koreanHangulAdjacentStaleStartTrace,
  koreanHangulAdjacentStaleFinishTrace,
  koreanHangulBasicTrace,
  koreanHangulCompositionBlurTrace,
  koreanHangulCompositionHistoryTrace,
  koreanHangulEnterConfirmTrace,
] satisfies EditorTraceReplay[];

const oracleReplayTraces = [
  ...p0SelectionDeletionClipboardTraces,
  ...imeTraces,
] satisfies EditorTraceReplay[];

const expectedContractsByTrace = new Map<
  string,
  readonly EditorInputContractId[]
>([
  ["korean-hangul-active-mark", ["IME-04"]],
  ["korean-hangul-adjacent-stale-finish", ["IME-03"]],
  ["korean-hangul-adjacent-stale-start", ["IME-03"]],
  ["korean-hangul-basic", ["IME-01"]],
  ["korean-hangul-composition-blur", ["IME-01"]],
  ["korean-hangul-composition-history", ["HIST-02"]],
  ["korean-hangul-enter-confirm", ["IME-02"]],
  ["p0-atom-keyboard-navigation", ["SEL-04"]],
  ["p0-atom-replacement", ["MUT-02"]],
  ["p0-cut", ["CLIP-03"]],
  ["p0-empty-block-backspace", ["DEL-03"]],
  ["p0-horizontal-selection", ["SEL-01", "SEL-02", "SEL-03"]],
  ["p0-markdown-drop", ["CLIP-02"]],
  ["p0-plain-paste", ["CLIP-01"]],
  ["p0-range-backspace", ["DEL-02"]],
  ["p0-range-delete-forward", ["DEL-02"]],
  ["p0-range-replacement", ["MUT-01"]],
]);

const requiredReplayContractIds: readonly EditorInputContractId[] = [
  "CLIP-01",
  "CLIP-02",
  "CLIP-03",
  "DEL-02",
  "DEL-03",
  "HIST-02",
  "IME-01",
  "IME-02",
  "IME-03",
  "IME-04",
  "MUT-01",
  "MUT-02",
  "SEL-01",
  "SEL-02",
  "SEL-03",
  "SEL-04",
];

describe("editor input oracle trace contract mapping", () => {
  it("keeps replay fixtures mapped to stable input contract IDs", () => {
    expect(traceNames(oracleReplayTraces)).toEqual(
      Array.from(expectedContractsByTrace.keys()).sort(),
    );

    for (const trace of oracleReplayTraces) {
      expect(trace.contractIds, trace.name).toEqual(
        expectedContractsByTrace.get(trace.name),
      );
    }
  });

  it("keeps the P0 replay acceptance contracts covered by fixture metadata", () => {
    const covered = new Set(
      oracleReplayTraces.flatMap((trace) => trace.contractIds ?? []),
    );

    expect(
      requiredReplayContractIds.filter(
        (contractId) => !covered.has(contractId),
      ),
    ).toEqual([]);
  });
});

function traceNames(traces: readonly EditorTraceReplay[]) {
  return traces.map((trace) => trace.name).sort();
}
