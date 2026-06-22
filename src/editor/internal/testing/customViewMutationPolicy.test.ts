import { describe, expect, it } from "vitest";

type NativeMutationRecordType = "attributes" | "characterData" | "childList";

type CustomViewMutationRecord =
  | {
      target: "chrome" | "content";
      type: NativeMutationRecordType;
    }
  | {
      target: "document" | "inner-owner";
      type: "selection";
    };

type UnsafeIgnoreMutation = (record: CustomViewMutationRecord) => boolean;

type SafeCustomViewHooks = {
  ignoreViewMutation?: (
    record: Extract<
      CustomViewMutationRecord,
      { type: NativeMutationRecordType }
    >,
  ) => boolean;
  ownsViewSelection?: (
    record: Extract<CustomViewMutationRecord, { type: "selection" }>,
  ) => boolean;
};

describe("custom view mutation policy", () => {
  it("reproduces stale selection when a single ignoreMutation hook swallows selection records", () => {
    const result = replayUnsafeIgnoreMutation(
      [
        {
          target: "document",
          type: "selection",
        },
      ],
      () => true,
    );

    expect(result).toEqual({
      reparsed: false,
      selectionResynced: false,
      staleSelection: true,
    });
  });

  it("does not let DOM mutation ignore hooks suppress document selection resync", () => {
    const result = replaySafeCustomViewPolicy(
      [
        {
          target: "document",
          type: "selection",
        },
      ],
      {
        ignoreViewMutation: () => true,
      },
    );

    expect(result).toEqual({
      ignoredMutations: 0,
      reparsed: false,
      selectionResynced: true,
    });
  });

  it("allows only explicit inner selection owners to skip outer selection reread", () => {
    const result = replaySafeCustomViewPolicy(
      [
        {
          target: "inner-owner",
          type: "selection",
        },
      ],
      {
        ownsViewSelection: (record) => record.target === "inner-owner",
      },
    );

    expect(result).toEqual({
      ignoredMutations: 0,
      reparsed: false,
      selectionResynced: false,
    });
  });
});

function replayUnsafeIgnoreMutation(
  records: readonly CustomViewMutationRecord[],
  ignoreMutation: UnsafeIgnoreMutation,
) {
  let reparsed = false;
  let selectionResynced = false;
  let staleSelection = false;

  for (const record of records) {
    if (ignoreMutation(record)) {
      if (record.type === "selection" && record.target === "document") {
        staleSelection = true;
      }
      continue;
    }

    if (record.type === "selection") {
      selectionResynced = true;
    } else {
      reparsed = true;
    }
  }

  return { reparsed, selectionResynced, staleSelection };
}

function replaySafeCustomViewPolicy(
  records: readonly CustomViewMutationRecord[],
  hooks: SafeCustomViewHooks,
) {
  let ignoredMutations = 0;
  let reparsed = false;
  let selectionResynced = false;

  for (const record of records) {
    if (record.type === "selection") {
      if (!hooks.ownsViewSelection?.(record)) {
        selectionResynced = true;
      }
      continue;
    }

    if (hooks.ignoreViewMutation?.(record)) {
      ignoredMutations += 1;
      continue;
    }

    reparsed = true;
  }

  return { ignoredMutations, reparsed, selectionResynced };
}
