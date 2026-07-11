type BreakImportMode = "editor-dom" | "html-paste";

type BreakTraceCase = {
  brCount: number;
  browserInnerText: string;
  browserTextContent: string;
  classification: "ignored-kludge" | "meaningful-newline";
  html: string;
  mode: BreakImportMode;
  name:
    | "atom-boundary-kludge"
    | "code-block-paste"
    | "empty-paragraph-placeholder"
    | "inline-hard-break-paste"
    | "inline-trailing-break-paste"
    | "list-parent-stray-break"
    | "native-enter-editor-dom";
  policyText: string;
};

export type StrayBreakTrace = {
  cases: BreakTraceCase[];
  policy: {
    editorDomBreak: "ignore";
    modelLineBreak: "text-newline";
    pasteBreak: "contextual-newline";
  };
};

const ATOM_REPLACEMENT = "\uFFFC";

export function runStrayBreakTrace(): StrayBreakTrace {
  const cases = [
    traceCase({
      classification: "ignored-kludge",
      html: "<p data-empty-block='true'><br></p>",
      mode: "editor-dom",
      name: "empty-paragraph-placeholder",
    }),
    traceCase({
      classification: "ignored-kludge",
      html: "before<div><br></div>",
      mode: "editor-dom",
      name: "native-enter-editor-dom",
    }),
    traceCase({
      classification: "ignored-kludge",
      html: "A<span data-editable-atom='mention-ada' contenteditable='false'>@Ada</span><br>",
      mode: "editor-dom",
      name: "atom-boundary-kludge",
    }),
    traceCase({
      classification: "ignored-kludge",
      html: "<ul><br><li>item</li></ul>",
      mode: "editor-dom",
      name: "list-parent-stray-break",
    }),
    traceCase({
      classification: "meaningful-newline",
      html: "<span data-inline-clipboard='true'>first<br>second</span>",
      mode: "html-paste",
      name: "inline-hard-break-paste",
    }),
    traceCase({
      classification: "meaningful-newline",
      html: "<span data-inline-clipboard='true'>inline<br></span>",
      mode: "html-paste",
      name: "inline-trailing-break-paste",
    }),
    traceCase({
      classification: "meaningful-newline",
      html: "<pre><code>line 1<br>line 2</code></pre>",
      mode: "html-paste",
      name: "code-block-paste",
    }),
  ];

  return {
    cases,
    policy: {
      editorDomBreak: "ignore",
      modelLineBreak: "text-newline",
      pasteBreak: "contextual-newline",
    },
  };
}

function traceCase({
  classification,
  html,
  mode,
  name,
}: {
  classification: BreakTraceCase["classification"];
  html: string;
  mode: BreakImportMode;
  name: BreakTraceCase["name"];
}): BreakTraceCase {
  const host = document.createElement("section");
  host.contentEditable = "true";
  host.dataset.testid = `stray-break-${name}`;
  host.innerHTML = html;
  document.body.append(host);

  return {
    brCount: host.querySelectorAll("br").length,
    browserInnerText: host instanceof HTMLElement ? host.innerText : "",
    browserTextContent: host.textContent ?? "",
    classification,
    html,
    mode,
    name,
    policyText: policyTextContent(host, mode),
  };
}

function policyTextContent(node: Node, mode: BreakImportMode): string {
  if (isAtomElement(node)) {
    return ATOM_REPLACEMENT;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node instanceof HTMLBRElement) {
    return mode === "html-paste" && isMeaningfulPasteBreak(node) ? "\n" : "";
  }
  let text = "";
  for (const child of Array.from(node.childNodes)) {
    text += policyTextContent(child, mode);
  }
  return text;
}

function isMeaningfulPasteBreak(br: HTMLBRElement): boolean {
  if (isEmptyBlockPlaceholder(br)) {
    return false;
  }
  if (br.closest("pre, code") !== null) {
    return true;
  }
  if (br.closest("[data-inline-clipboard='true']") !== null) {
    return true;
  }
  return hasTextBefore(br) && hasTextAfter(br);
}

function isEmptyBlockPlaceholder(br: HTMLBRElement): boolean {
  const parent = br.parentElement;
  return (
    parent !== null &&
    parent.childNodes.length === 1 &&
    parent.textContent === "" &&
    (parent.hasAttribute("data-empty-block") ||
      parent.matches("p, div, li, blockquote"))
  );
}

function hasTextBefore(node: Node): boolean {
  let current: Node | null = node.previousSibling;
  while (current !== null) {
    if (policyTextContent(current, "editor-dom").length > 0) {
      return true;
    }
    current = current.previousSibling;
  }
  return false;
}

function hasTextAfter(node: Node): boolean {
  let current: Node | null = node.nextSibling;
  while (current !== null) {
    if (policyTextContent(current, "editor-dom").length > 0) {
      return true;
    }
    current = current.nextSibling;
  }
  return false;
}

function isAtomElement(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && node.hasAttribute("data-editable-atom");
}
