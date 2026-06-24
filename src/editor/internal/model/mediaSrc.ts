const FIGURE_SRC_PROTOCOLS = new Set(["http:", "https:"]);
const URL_BASE = "https://editable.invalid";

export function normalizeFigureSrc(src: string): string | null {
  const trimmedSrc = src.trim();
  if (trimmedSrc.length === 0) {
    return null;
  }
  if (hasControlCharacter(trimmedSrc)) {
    return null;
  }
  if (/^[/\\]{2}/.test(trimmedSrc)) {
    return null;
  }

  try {
    const parsed = new URL(trimmedSrc, URL_BASE);
    if (parsed.origin === URL_BASE) {
      return trimmedSrc;
    }
    if (!FIGURE_SRC_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }
    if (isExternalSvgPath(parsed.pathname)) {
      return null;
    }

    return trimmedSrc;
  } catch {
    return null;
  }
}

export function renderableFigureSrc(src: string): string | undefined {
  return normalizeFigureSrc(src) ?? undefined;
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }

  return false;
}

function isExternalSvgPath(pathname: string): boolean {
  return decodedPathname(pathname).toLowerCase().endsWith(".svg");
}

function decodedPathname(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}
