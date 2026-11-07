import { hasControlChars } from "@/lib/sanitize";
import { SITE_URL } from "@/lib/site";

const MAX_START_SECONDS = 10_000_000;

export function startSeconds(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > MAX_START_SECONDS) return 0;
  return Math.floor(number);
}

/** Only path-safe characters can be used for a video id or channel handle. */
export function safePathSegment(value: string): string {
  return /^[A-Za-z0-9._-]{1,200}$/.test(value) ? value : "";
}

export function watchLink(origin: string, id: string, seconds = 0) {
  const url = new URL(`/watch/${encodeURIComponent(id)}`, origin || SITE_URL);
  if (startSeconds(seconds)) url.searchParams.set("t", String(startSeconds(seconds)));
  return url.href;
}

export function embedLink(origin: string, id: string, seconds = 0) {
  const url = new URL(`/embed/${encodeURIComponent(id)}`, origin || SITE_URL);
  if (startSeconds(seconds)) url.searchParams.set("t", String(startSeconds(seconds)));
  return url.href;
}

/**
 * Validates an external link. Rejects executable schemes, credentials in the
 * URL (phishing), control characters and oversized values.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048 || hasControlChars(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** HTTPS-only variant for URLs that are fetched or rendered as media. */
export function safeHttpsUrl(value: string | null | undefined): string | null {
  const url = safeExternalUrl(value);
  return url?.startsWith("https://") ? url : null;
}

export const CHANNEL_LINKS = [
  ["website_url", "Website"],
  ["instagram_url", "Instagram"],
  ["x_url", "X"],
  ["discord_url", "Discord"],
] as const;
