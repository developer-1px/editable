import type { PointerEvent } from "react";

export function capturePointer(element: HTMLElement, pointerId: number) {
  if (typeof element.setPointerCapture !== "function") {
    return;
  }

  element.setPointerCapture(pointerId);
}

export function releasePointer(element: HTMLElement, pointerId: number) {
  if (typeof element.releasePointerCapture !== "function") {
    return;
  }

  element.releasePointerCapture(pointerId);
}

export function isTouchPointer(event: PointerEvent<HTMLElement>) {
  return event.pointerType === "touch";
}
