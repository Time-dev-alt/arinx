export function compact(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(n);
}
export const views = (n: number) => `${compact(n)} views`;
export const subs = (n: number) => `${compact(n)} subscribers`;

export function ago(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  const units: [number, string][] = [
    [31536000, "year"],
    [2592000, "month"],
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [s, u] of units) {
    const v = Math.floor(d / s);
    if (v >= 1) return `${v} ${u}${v > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

export function duration(s: number) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function parseTime(t: string) {
  return t.split(":").reduce((a, p) => a * 60 + Number(p), 0);
}

export const pageHead = (title: string, description: string, path?: string) => ({
  meta: [
    { title: `${title} - ArinX` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} - ArinX` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { property: "og:site_name", content: "ArinX" },
    ...(path ? [{ property: "og:url", content: `https://arin-x.lovable.app${path}` }] : []),
  ],
  links: path ? [{ rel: "canonical", href: `https://arin-x.lovable.app${path}` }] : [],
});
