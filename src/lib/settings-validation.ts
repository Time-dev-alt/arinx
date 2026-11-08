/**
 * Write-time validation for owner-editable platform settings.
 *
 * The DB is only reachable with the publishable key + RLS, so anything the
 * owner types is persisted verbatim unless we clean it here. Render-time
 * sanitizers remain the last line of defence, but storing *only* known-safe
 * values prevents a compromised or careless owner session from planting a
 * payload that a future renderer might interpolate unsafely.
 *
 * Pure and DOM-independent except for the ad snippets, which use DOMParser in
 * the browser (the admin page is client-only).
 */
import type { SiteSettings } from "@/lib/settings";
import { sanitizeAdMarkup, stripControlChars, hasControlChars } from "@/lib/sanitize";
import { safeHttpsUrl } from "@/lib/watch-tools";

export type EditableSettings = Omit<SiteSettings, "id" | "updated_at">;

export interface SettingsValidation {
  value: EditableSettings;
  /** Blocking problems — the save must not go through. */
  errors: string[];
  /** True when at least one value was cleaned before saving. */
  cleaned: boolean;
}

const AD_FIELDS = ["adsterra_feed", "adsterra_native", "adsterra_sidebar"] as const;
const URL_FIELDS = [
  ["preroll_vast_url", "VAST tag"],
  ["preroll_video_url", "Sponsor video"],
  ["preroll_click_url", "Ad click-through"],
] as const;
const WATERMARK_POSITIONS = new Set(["top-left", "top-right", "bottom-left", "bottom-right"]);
const COMPRESSION_PRESETS = new Set(["ultra", "balanced", "quality"]);

const MAX_AD_MARKUP = 20_000;
const MAX_WATERMARK_TEXT = 120;
const MAX_CUSTOMER_CODE = 128;

/** Blocks control characters, oversized values and non-HTTPS URLs. */
function cleanUrl(raw: string, label: string, errors: string[]): string {
  const value = raw.trim();
  if (!value) return "";
  if (value.length > 2048 || hasControlChars(value)) {
    errors.push(`${label} contains invalid characters or is too long.`);
    return "";
  }
  const safe = safeHttpsUrl(value);
  if (!safe) {
    errors.push(`${label} must be an HTTPS URL.`);
    return "";
  }
  return safe;
}

export function validateSiteSettings(settings: EditableSettings): SettingsValidation {
  const errors: string[] = [];
  let cleaned = false;
  const value: EditableSettings = { ...settings };

  for (const field of AD_FIELDS) {
    const raw = String(settings[field] ?? "").slice(0, MAX_AD_MARKUP);
    const sanitized = sanitizeAdMarkup(raw);
    if (sanitized !== raw) cleaned = true;
    value[field] = sanitized;
  }

  for (const [field, label] of URL_FIELDS) {
    const raw = String(settings[field] ?? "");
    const safe = cleanUrl(raw, label, errors);
    if (safe !== raw) cleaned = true;
    value[field] = safe;
  }

  const watermarkText = stripControlChars(String(settings.watermark_text ?? ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_WATERMARK_TEXT);
  if (watermarkText !== settings.watermark_text) cleaned = true;
  value.watermark_text = watermarkText;

  if (!WATERMARK_POSITIONS.has(settings.watermark_position)) {
    errors.push("Choose a valid watermark position.");
    value.watermark_position = "bottom-right";
    cleaned = true;
  }
  if (!COMPRESSION_PRESETS.has(settings.compression_preset)) {
    errors.push("Choose a valid compression preset.");
    value.compression_preset = "balanced";
    cleaned = true;
  }

  const skip = Number(settings.preroll_skip_seconds);
  const clamped = Number.isFinite(skip) ? Math.min(30, Math.max(0, Math.round(skip))) : 0;
  if (clamped !== settings.preroll_skip_seconds) cleaned = true;
  value.preroll_skip_seconds = clamped;

  const customerCode = stripControlChars(String(settings.cf_customer_code ?? ""))
    .trim()
    .slice(0, MAX_CUSTOMER_CODE);
  if (customerCode !== settings.cf_customer_code) cleaned = true;
  value.cf_customer_code = customerCode;

  return { value, errors, cleaned };
}
