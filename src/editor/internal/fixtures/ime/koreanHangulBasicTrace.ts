import type { EditorTraceReplay } from "../../testing/editorTraceReplay";

const firstTextPath = "/root/children/0/children/0/text";

export const koreanHangulBasicTrace = {
  contractIds: ["IME-01"],
  name: "korean-hangul-basic",
  schema: "editable-trace-replay@1",
  steps: [
    { kind: "selection", path: firstTextPath, offset: 4 },
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
    { kind: "text", path: firstTextPath, text: "Plaiㅇn ", offset: 5 },
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
    { kind: "text", path: firstTextPath, text: "Plai아n ", offset: 5 },
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
    { kind: "text", path: firstTextPath, text: "Plai안n ", offset: 5 },
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
    {
      kind: "event",
      event: {
        type: "beforeinput",
        inputType: "insertText",
        data: "안",
        isComposing: false,
      },
      expect: {
        after: {
          pathText: {
            [firstTextPath]: "Plai안n ",
          },
          selectionOffset: "5",
          selectionPath: firstTextPath,
        },
      },
    },
    { kind: "timers" },
  ],
} satisfies EditorTraceReplay;
