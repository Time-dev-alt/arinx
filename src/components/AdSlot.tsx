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
 * Renders an owner-supplied ad snippet. The markup is allowlisted first (see
 * sanitizeAdMarkup) so an injected `<img onerror>`, `javascript:` URL or
 * arbitrary inline script can never become stored XSS. Scripts are re-created
 * so dynamic ad tags still execute.
 */
export function AdSlot({ slot, className }: { slot: Slot; className?: string }) {
  const { data } = useSiteSettings();
  const ref = useRef<HTMLDivElement>(null);
  const code = data?.ads_enabled ? ((data[slot as keyof SiteSettings] as string) ?? "") : "";
  const safeHtml = sanitizeAdMarkup(code);

  useEffect(() => {
    const el = ref.current;
    if (!el || !safeHtml) return;
    el.innerHTML = safeHtml;
    el.querySelectorAll("script").forEach((old) => {
      const s = document.createElement("script");
      for (const a of Array.from(old.attributes)) {
        const name = a.name.toLowerCase();
        if (!SCRIPT_ATTRS.has(name) && !name.startsWith("data-")) continue;
        if (name.startsWith("on")) continue;
        s.setAttribute(name, a.value);
      }
      s.text = old.textContent ?? "";
      old.replaceWith(s);
    });
    return () => {
      el.innerHTML = "";
    };
  }, [safeHtml]);

  if (!safeHtml) return null;
  return (
    <div className={className}>
      <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Sponsored</p>
      <div ref={ref} className="flex justify-center overflow-hidden" />
    </div>
  );
}
