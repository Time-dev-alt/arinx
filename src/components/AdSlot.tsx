import { useEffect, useRef } from "react";
import { useSiteSettings, type SiteSettings } from "@/lib/settings";
import { sanitizeAdMarkup } from "@/lib/sanitize";

type Slot = "adsterra_sidebar" | "adsterra_feed" | "adsterra_native";

const SCRIPT_ATTRS = new Set([
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

/**
 * Renders an owner-supplied ad snippet.
 *
 * Two independent barriers:
 *  1. `sanitizeAdMarkup` allowlists the stored HTML (no event handlers,
 *     iframes, javascript:/data: URLs or arbitrary inline JS).
 *  2. The result is imported as DOM nodes — `innerHTML` is never used, so even
 *     a sanitizer regression cannot turn the payload into a live DOM sink.
 * Scripts are intentionally recreated (imported scripts are inert) with the
 * same allowlist, and inherit the document CSP nonce when one is present.
 */
export function AdSlot({ slot, className }: { slot: Slot; className?: string }) {
  const { data } = useSiteSettings();
  const ref = useRef<HTMLDivElement>(null);
  const code = data?.ads_enabled ? ((data[slot as keyof SiteSettings] as string) ?? "") : "";
  const safeHtml = sanitizeAdMarkup(code);

  useEffect(() => {
    const el = ref.current;
    if (!el || !safeHtml || typeof DOMParser === "undefined") {
      el?.replaceChildren();
      return;
    }

    const parsed = new DOMParser().parseFromString(`<div>${safeHtml}</div>`, "text/html");
    const root = parsed.body.firstElementChild;
    if (!root) return;
    const fragment = document.createDocumentFragment();
    for (const node of Array.from(root.childNodes)) {
      fragment.appendChild(document.importNode(node, true));
    }

    const nonce =
      document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content || null;
    for (const old of Array.from(fragment.querySelectorAll("script"))) {
      const script = document.createElement("script");
      for (const attr of Array.from(old.attributes)) {
        const name = attr.name.toLowerCase();
        if (!SCRIPT_ATTRS.has(name) && !name.startsWith("data-")) continue;
        if (name.startsWith("on") || /javascript:|data:/i.test(attr.value)) continue;
        script.setAttribute(name, attr.value);
      }
      script.text = old.textContent ?? "";
      if (nonce) script.setAttribute("nonce", nonce);
      old.replaceWith(script);
    }

    el.replaceChildren(fragment);
    return () => el.replaceChildren();
  }, [safeHtml]);

  if (!safeHtml) return null;
  return (
    <div className={className}>
      <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Sponsored</p>
      <div ref={ref} className="flex justify-center overflow-hidden" />
    </div>
  );
}
