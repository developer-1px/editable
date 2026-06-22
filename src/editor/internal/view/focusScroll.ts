type ElementScrollSnapshot = {
  element: Element;
  scrollLeft: number;
  scrollTop: number;
};

export function focusElementPreservingScroll(
  element: HTMLElement | null,
): boolean {
  if (element === null) {
    return false;
  }

  const snapshots = collectScrollSnapshots(element);
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  } finally {
    restoreScrollSnapshots(snapshots);
  }

  return element.ownerDocument.activeElement === element;
}

function collectScrollSnapshots(element: HTMLElement): ElementScrollSnapshot[] {
  const snapshots: ElementScrollSnapshot[] = [];
  const seen = new Set<Element>();
  const add = (target: Element | null | undefined) => {
    if (target == null || seen.has(target)) {
      return;
    }

    seen.add(target);
    snapshots.push({
      element: target,
      scrollLeft: target.scrollLeft,
      scrollTop: target.scrollTop,
    });
  };

  for (
    let current = element.parentElement;
    current !== null;
    current = current.parentElement
  ) {
    add(current);
  }

  add(element.ownerDocument.scrollingElement);

  return snapshots;
}

function restoreScrollSnapshots(snapshots: ElementScrollSnapshot[]) {
  for (const snapshot of snapshots) {
    snapshot.element.scrollLeft = snapshot.scrollLeft;
    snapshot.element.scrollTop = snapshot.scrollTop;
  }
}
