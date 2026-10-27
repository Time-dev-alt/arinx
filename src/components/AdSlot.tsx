import { useEffect, useRef } from "react";
import { useSiteSettings, type SiteSettings } from "@/lib/settings";

type Slot = "adsterra_sidebar" | "adsterra_feed" | "adsterra_native";

/** Renders an Adsterra code snippet pasted by the owner in the admin panel. Scripts are re-created so they execute. */
export function AdSlot({ slot, className }: { slot: Slot; className?: string }) {
  const { data } = useSiteSettings();
  const ref = useRef<HTMLDivElement>(null);
  const code = data?.ads_enabled ? (data[slot as keyof SiteSettings] as string) : "";

  useEffect(() => {
    const el = ref.current;
    if (!el || !code) return;
    el.innerHTML = code;
    el.querySelectorAll("script").forEach((old) => {
      const s = document.createElement("script");
      for (const a of Array.from(old.attributes)) s.setAttribute(a.name, a.value);
      s.text = old.text;
      old.replaceWith(s);
    });
    return () => { el.innerHTML = ""; };
  }, [code]);

  if (!code) return null;
  return (
    <div className={className}>
      <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Sponsored</p>
      <div ref={ref} className="flex justify-center overflow-hidden" />
    </div>
  );
}
