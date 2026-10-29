export function startSeconds(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

export function watchLink(origin: string, id: string, seconds = 0) {
  const url = new URL(`/watch/${encodeURIComponent(id)}`, origin);
  if (startSeconds(seconds)) url.searchParams.set("t", String(startSeconds(seconds)));
  return url.href;
}

export function embedLink(origin: string, id: string, seconds = 0) {
  const url = new URL(`/embed/${encodeURIComponent(id)}`, origin);
  if (startSeconds(seconds)) url.searchParams.set("t", String(startSeconds(seconds)));
  return url.href;
}

export function safeExternalUrl(value: string | null | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export const CHANNEL_LINKS = [
  ["website_url", "Website"], ["instagram_url", "Instagram"],
  ["x_url", "X"], ["discord_url", "Discord"],
] as const;