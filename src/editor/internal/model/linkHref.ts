const LINK_HREF_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

export function normalizeLinkHref(href: string): string | null {
  const trimmedHref = href.trim();
  if (trimmedHref.length === 0) {
    return null;
  }

  try {
    const parsed = new URL(trimmedHref, "https://editable.invalid");
    if (parsed.origin === "https://editable.invalid") {
      return trimmedHref;
    }

    return LINK_HREF_PROTOCOLS.has(parsed.protocol) ? trimmedHref : null;
  } catch {
    return null;
  }
}

export function renderableLinkHref(href: string): string | undefined {
  return normalizeLinkHref(href) ?? undefined;
}
