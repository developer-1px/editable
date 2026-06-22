import type { EditorTraceReplay } from "../../testing/editorTraceReplay";

const firstTextPath = "/root/children/0/children/0/text";

export const koreanHangulAdjacentStaleStartTrace = {
  name: "korean-hangul-adjacent-stale-start",
  schema: "editable-trace-replay@1",
  steps: [
    { kind: "selection", path: firstTextPath, offset: 5 },
    { kind: "event", event: { type: "keydown", key: "ㅇ" } },
    { kind: "event", event: { type: "compositionstart" } },
    { kind: "event", event: { type: "compositionupdate", data: "ㅇ" } },
    {
      kind: "event",
      event: {
        type: "beforeinput",
        inputType: "insertCompositionText",
        data: "ㅇ",
        isComposing: true,
      },
    },
    { kind: "text", path: firstTextPath, text: "Plainㅇ ", offset: 5 },
    {
      kind: "event",
      event: {
        type: "input",
        inputType: "insertCompositionText",
        data: "ㅇ",
        isComposing: true,
      },
    },
    { kind: "event", event: { type: "compositionupdate", data: "아" } },
    {
      kind: "event",
      event: {
        type: "beforeinput",
        inputType: "insertCompositionText",
        data: "아",
        isComposing: true,
      },
    },
    { kind: "text", path: firstTextPath, text: "Plain아 ", offset: 5 },
    {
      kind: "event",
      event: {
        type: "input",
        inputType: "insertCompositionText",
        data: "아",
        isComposing: true,
      },
    },
    { kind: "event", event: { type: "compositionupdate", data: "안" } },
    {
      kind: "event",
      event: {
        type: "beforeinput",
        inputType: "insertCompositionText",
        data: "안",
        isComposing: true,
      },
    },
    { kind: "text", path: firstTextPath, text: "Plain안 ", offset: 6 },
    {
      kind: "event",
      event: {
        type: "input",
        inputType: "insertCompositionText",
        data: "안",
        isComposing: true,
      },
    },
    { kind: "event", event: { type: "compositionend", data: "안" } },
    { kind: "event", event: { type: "compositionstart" } },
    { kind: "event", event: { type: "compositionupdate", data: "ㄴ" } },
    {
      kind: "event",
      event: {
        type: "beforeinput",
        inputType: "insertCompositionText",
        data: "ㄴ",
        isComposing: true,
      },
    },
    { kind: "text", path: firstTextPath, text: "Plain안ㄴ ", offset: 7 },
    {
      kind: "event",
      event: {
        type: "input",
        inputType: "insertCompositionText",
        data: "ㄴ",
        isComposing: true,
      },
    },
    { kind: "timers" },
  ],
} satisfies EditorTraceReplay;

export const koreanHangulAdjacentStaleFinishTrace = {
  name: "korean-hangul-adjacent-stale-finish",
  schema: "editable-trace-replay@1",
  steps: [
    { kind: "event", event: { type: "compositionupdate", data: "녀" } },
    {
      kind: "event",
      event: {
        type: "beforeinput",
        inputType: "insertCompositionText",
        data: "녀",
        isComposing: true,
      },
    },
    { kind: "text", path: firstTextPath, text: "Plain안녀 ", offset: 7 },
    {
      kind: "event",
      event: {
        type: "input",
        inputType: "insertCompositionText",
        data: "녀",
        isComposing: true,
      },
    },
    { kind: "event", event: { type: "compositionupdate", data: "녕" } },
    {
      kind: "event",
      event: {
        type: "beforeinput",
        inputType: "insertCompositionText",
        data: "녕",
        isComposing: true,
      },
    },
    { kind: "text", path: firstTextPath, text: "Plain안녕 ", offset: 7 },
    {
      kind: "event",
      event: {
        type: "input",
        inputType: "insertCompositionText",
        data: "녕",
        isComposing: true,
      },
    },
    { kind: "event", event: { type: "compositionend", data: "녕" } },
    { kind: "timers" },
  ],
} satisfies EditorTraceReplay;
