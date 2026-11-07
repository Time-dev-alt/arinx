/**
 * Defence-in-depth for content that is stored in the database and later
 * injected into the document (ad snippets) or interpolated into PostgREST
 * filter strings (search terms).
 *
 * Ad snippets are owner-supplied HTML. Only a deliberately small subset is
 * allowed through: HTTPS <script src> tags, simple containers and ad-network
 * configuration object literals. Inline event handlers, javascript: URLs,
 * iframes, arbitrary inline JS and unsafe attributes are dropped.
 */

const ALLOWED_CONTAINERS = new Set(["DIV", "INS", "SPAN", "SECTION"]);
const ALLOWED_SCRIPT_ATTRS = new Set([
  "src",
  "type",
  "async",
  "defer",
  "charset",
  "crossorigin",
  "referrerpolicy",
  "integrity",
  "id",
  "class",
]);
const ALLOWED_CONTAINER_ATTRS = new Set(["id", "class"]);
const ALLOWED_CONFIG_GLOBALS = new Set([
  "atOptions",
  "adsterra",
  "adsterraOptions",
  "hilltopAds",
  "hilltopOptions",
  "__hilltop",
  "adsbygoogle",
]);
const INLINE_CONFIG =
  /^\s*(?:(?:var|let|const)\s+)?([A-Za-z_$][\w$]*)\s*=\s*(\{[\s\S]*\})\s*;?\s*$/;
const SAFE_LITERAL = /^[\w\s'"`:,{}[\].+%\-/\\]*$/;
const FORBIDDEN_JS =
  /\b(document|window|location|cookie|eval|fetch|import|parent|top|self|globalThis|XMLHttpRequest|Function|constructor|__proto__|setTimeout|setInterval)\b/;

function isSafeSrc(value: string): string | null {
  const raw = value.trim();
  const normalised = raw.startsWith("//") ? `https:${raw}` : raw;
  try {
    const url = new URL(normalised, "https://arin-x.lovable.app");
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.href.length > 2048) return null;
    return url.href;
  } catch {
    return null;
  }
}

function isSafeInlineConfig(source: string): boolean {
  if (source.length > 4000 || FORBIDDEN_JS.test(source)) return false;
  const match = INLINE_CONFIG.exec(source);
  if (!match) return false;
  if (!ALLOWED_CONFIG_GLOBALS.has(match[1])) return false;
  const literal = match[2];
  // Object literal only: no calls, assignments, comments or expressions.
  return SAFE_LITERAL.test(literal);
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function serialiseElement(el: Element, depth: number): string {
  if (depth > 3) return "";
  const tag = el.tagName.toUpperCase();
  const tagName = tag.toLowerCase();

  if (tag === "SCRIPT") {
    const src = el.getAttribute("src");
    const attrs: string[] = [];
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (!ALLOWED_SCRIPT_ATTRS.has(name) && !name.startsWith("data-")) continue;
      if (name === "src") continue;
      // Never copy event handlers or executable URL attributes.
      if (name.startsWith("on") || /javascript:|data:/i.test(attr.value)) continue;
      attrs.push(`${name}="${escapeAttr(attr.value)}"`);
    }
    if (src) {
      const safeSrc = isSafeSrc(src);
      if (!safeSrc) return "";
      return `<script src="${escapeAttr(safeSrc)}"${attrs.length ? ` ${attrs.join(" ")}` : ""}></script>`;
    }
    const inline = el.textContent ?? "";
    if (!isSafeInlineConfig(inline)) return "";
    return `<script${attrs.length ? ` ${attrs.join(" ")}` : ""}>${inline}</script>`;
  }

  if (!ALLOWED_CONTAINERS.has(tag)) return "";
  const attrs: string[] = [];
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (!ALLOWED_CONTAINER_ATTRS.has(name) && !name.startsWith("data-")) continue;
    if (/javascript:|data:/i.test(attr.value)) continue;
    attrs.push(`${name}="${escapeAttr(attr.value)}"`);
  }
  const children = Array.from(el.childNodes)
    .map((node) =>
      node.nodeType === 1 && node instanceof Element ? serialiseElement(node, depth + 1) : "",
    )
    .join("");
  return `<${tagName}${attrs.length ? ` ${attrs.join(" ")}` : ""}>${children}</${tagName}>`;
}

/**
 * Returns inert, allowlisted markup. Anything executable that isn't an HTTPS
 * script or a plain config object is removed. Returns "" on the server where
 * the DOM is unavailable (ads are client-only anyway).
 */
export function sanitizeAdMarkup(input: string): string {
  if (!input || typeof DOMParser === "undefined") return "";
  const source = input.slice(0, 20_000);
  const doc = new DOMParser().parseFromString(
    `<div id="arinx-ad-root">${source}</div>`,
    "text/html",
  );
  const root = doc.getElementById("arinx-ad-root");
  if (!root) return "";
  return Array.from(root.children)
    .map((el) => serialiseElement(el, 0))
    .join("");
}

/** Rejects CR/LF and other control characters that enable header splitting. */
export function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** Replaces control characters with spaces before text is used in metadata. */
export function stripControlChars(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    out += code < 32 || code === 127 ? " " : value[i];
  }
  return out;
}

/**
 * Whitelists a search term before it is interpolated into a PostgREST `or()`
 * filter. Removes commas, parentheses, quotes, backslashes and wildcards that
 * could break out of the intended filter expression.
 */
export function sanitizeSearchTerm(input: string, maxLength = 60): string {
  return (input ?? "")
    .replace(/[^\p{L}\p{N} _.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
