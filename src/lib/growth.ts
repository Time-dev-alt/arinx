export const MONETIZATION_SUBSCRIBERS = 1000;
export function monetizationProgress(subscribers: number) {
  const count = Math.max(0, Math.floor(subscribers));
  return {
    eligible: count >= MONETIZATION_SUBSCRIBERS,
    remaining: Math.max(0, MONETIZATION_SUBSCRIBERS - count),
    percent: Math.min(100, count / 10),
  };
}
export function socialLink(url: string, platform: string) {
  const link = new URL(url);
  link.searchParams.set("utm_source", platform);
  link.searchParams.set("utm_medium", "social");
  return link.href;
}
export function withinPeriod(publishedAt: string, days: number, now = Date.now()) {
  return now - new Date(publishedAt).getTime() <= days * 86400000;
}
