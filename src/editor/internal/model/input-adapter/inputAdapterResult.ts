import type { SelectionSnap } from "@interactive-os/json-document";
import type { BlockCommandResult } from "../blockCommands";
import { selectionIsCollapsed } from "../richSelection";
import type { TextCommandResult } from "../textCommands";
import type { EditorInputResult } from "./inputAdapterTypes";

export function textCommandResult(
  result: TextCommandResult,
): EditorInputResult {
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    handled: true,
    patch: result.patch,
    selectionAfter: result.selectionAfter,
  };
}

export function blockCommandResult(
  result: BlockCommandResult,
): EditorInputResult {
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    handled: true,
    patch: result.patch,
    selectionAfter: result.selectionAfter,
  };
}

export function deletionResult(
  result: TextCommandResult,
  selection: SelectionSnap,
): EditorInputResult {
  return selectionIsCollapsed(selection)
    ? selectionResult(selection)
    : textCommandResult(result);
}

export function selectionResult(
  selectionAfter: SelectionSnap,
): EditorInputResult {
  return {
    ok: true,
    handled: true,
    patch: [],
    selectionAfter,
  };
}

export function selectionWithoutTransientContext(
  selection: SelectionSnap,
): SelectionSnap {
  const { context: _context, ...selectionWithoutContext } = selection;

  return selectionWithoutContext;
}

export function notHandled(): EditorInputResult {
  return {
    ok: true,
    handled: false,
  };
}
