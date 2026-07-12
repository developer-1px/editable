import type { JSONDocument } from "@interactive-os/json-document";
import {
  type CausalPatchInbox,
  createCausalPatchInbox,
} from "@interactive-os/json-document-causal-patch-inbox";
import {
  EditableDocumentSchema,
  type EditableDocumentValue,
  getJsonEditableDocumentHost,
  type JsonEditable,
} from "../../packages/editable";

export function createEditableCausalInbox(
  document: JSONDocument<EditableDocumentValue>,
  editor: JsonEditable,
): CausalPatchInbox<EditableDocumentValue> {
  const inbox = createCausalPatchInbox(document, {
    host: getJsonEditableDocumentHost(editor),
    positionalSchema: EditableDocumentSchema,
    stableIdScopes: [
      {
        scope: "editable-block",
        query: "/blocks/*",
        readId: (value) => readBlockId(value),
      },
    ],
  });
  let disposed = false;
  let retryPending = false;
  let retryScheduled = false;
  let lastAttemptedRevision: number | null = null;

  const scheduleRetry = (
    snapshot: ReturnType<JsonEditable["getSnapshot"]>,
    allowCurrentRevision = false,
  ): void => {
    if (
      disposed ||
      !retryPending ||
      retryScheduled ||
      snapshot.phase !== "idle" ||
      snapshot.queuedChanges !== 0 ||
      (!allowCurrentRevision && lastAttemptedRevision === snapshot.revision)
    ) {
      return;
    }
    retryScheduled = true;
    queueMicrotask(() => {
      retryScheduled = false;
      if (disposed || !retryPending) {
        return;
      }
      const latest = editor.getSnapshot();
      if (latest.phase !== "idle" || latest.queuedChanges !== 0) {
        return;
      }
      retryPending = false;
      lastAttemptedRevision = latest.revision;
      const result = inbox.ingest([]);
      if (!result.ok && result.code === "host_not_ready") {
        retryPending = true;
      }
    });
  };

  const stopEditorSubscription = editor.subscribe((snapshot) => {
    scheduleRetry(snapshot);
  });

  return {
    ingest(input) {
      const result = inbox.ingest(input);
      if (!result.ok && result.code === "host_not_ready") {
        retryPending = true;
        scheduleRetry(editor.getSnapshot(), true);
      } else if (result.ok) {
        retryPending = false;
      }
      return result;
    },
    current: () => inbox.current(),
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      stopEditorSubscription();
      inbox.dispose();
    },
  };
}

function readBlockId(value: unknown): string | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("id" in value) ||
    typeof value.id !== "string"
  ) {
    return null;
  }
  return value.id;
}
