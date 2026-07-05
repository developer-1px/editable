import type { Pointer } from "@interactive-os/json-document";

export type TextSurfaceId = Pointer;

export type NativeTextLease = {
  surface: TextSurfaceId;
  composing: boolean;
};
