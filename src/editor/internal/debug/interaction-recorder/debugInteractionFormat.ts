export function cssIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return `[Failed to serialize: ${String(error)}]`;
  }
}

export function currentUrl(): string | null {
  return typeof window === "undefined" ? null : window.location.href;
}

export function currentUserAgent(): string | null {
  return typeof navigator === "undefined" ? null : navigator.userAgent;
}

export function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
