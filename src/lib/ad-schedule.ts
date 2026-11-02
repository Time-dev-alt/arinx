/**
 * Ad break rules (owner-defined):
 *  - under 3 min  → 2 ads total (pre-roll + 1 mid-roll)
 *  - under 5 min  → 3 ads total
 *  - under 15 min → 5 ads total
 *  - 15 min+      → 5 ads total
 * Each ad must be watched for a guaranteed number of seconds before "Skip" unlocks,
 * scaled to the length of the video being watched.
 */
export function totalAds(durationSec: number): number {
  if (durationSec < 180) return 2;
  if (durationSec < 300) return 3;
  return 5;
}

/** Guaranteed (unskippable) ad seconds for a video of this length. */
export function guaranteedSeconds(durationSec: number): number {
  if (durationSec < 180) return 5;
  if (durationSec < 300) return 6;
  if (durationSec < 900) return 8;
  return 10;
}

/** Mid-roll positions in seconds, evenly spaced (pre-roll not included). */
export function midrollTimes(durationSec: number): number[] {
  if (!durationSec || durationSec < 10) return [];
  const n = totalAds(durationSec);
  return Array.from({ length: n - 1 }, (_, i) => Math.round((durationSec * (i + 1)) / n));
}

/** Seconds of "Ad in N" countdown shown before each mid-roll. */
export const AD_COUNTDOWN = 5;
