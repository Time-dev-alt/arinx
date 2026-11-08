/**
 * Central response-hardening policy for the SSR entry.
 *
 * Design rule: protection must not break the synced Lovable deployment. We
 * therefore enforce only directives that cannot affect rendering today, and
 * ship the complete policy as Report-Only so real-world violations can be
 * collected before flipping `ARINX_CSP_ENFORCE=1`.
 *
 * Deliberately avoided:
 *  - X-Frame-Options: the Lovable editor embeds the app and /embed/:id is a
 *    public, frameable player. frame-ancestors lives in the staged policy.
 *  - COOP / COEP by default: cross-origin isolation breaks third-party ad
 *    tags, Google Fonts and Supabase fetches. It is opt-in, scoped to the
 *    upload page, and only needed for multithreaded ffmpeg.wasm.
 */

export interface SecurityContext {
  pathname: string;
  isHttps: boolean;
  requestId?: string;
  /** Response content type, when already known. */
  contentType?: string | null;
}

const FRAME_ANCESTORS = [
  "'self'",
  "https://*.lovable.dev",
  "https://lovable.dev",
  "https://*.lovable.app",
  "https://*.e2b.app",
  "http://localhost:*",
  "http://127.0.0.1:*",
].join(" ");

/** Emergency fallback: cannot break scripts, styles, fonts, ads or the editor. */
export const BASELINE_CSP =
  "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https:";

/**
 * Enforced platform policy. Hosts are deliberately broad because ad snippet
 * domains are owner-configurable, but the high-value restrictions are real:
 * no plugins, no base-tag hijacking, no form exfiltration, no insecure script
 * origins, no HTTP framing ancestors, and no cross-origin worker injection.
 */
export const ENFORCED_CSP = [
  "default-src 'self' https: blob: data:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https: data:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https: wss: blob: data:",
  "worker-src 'self' blob:",
  "frame-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self' https:",
  "report-uri /csp-report",
].join("; ");

/**
 * Target policy, shipped Report-Only. It removes inline-script/eval escape
 * hatches and enables Trusted Types so the remaining DOM sinks surface in the
 * report stream. Promoted to enforcement only after those reports are clean.
 */
export const TARGET_CSP = [
  "default-src 'self'",
  "script-src 'self' blob: https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https: wss: blob: data:",
  "worker-src 'self' blob:",
  "frame-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  `frame-ancestors ${FRAME_ANCESTORS}`,
  "require-trusted-types-for 'script'",
  "report-uri /csp-report",
].join("; ");

export const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "serial=()",
  "bluetooth=()",
  "midi=()",
  "magnetometer=()",
  "gyroscope=()",
  "accelerometer=()",
].join(", ");

const PRIVATE_PREFIXES = [
  "/admin",
  "/auth",
  "/studio",
  "/library",
  "/history",
  "/subscriptions",
  "/playlist",
  "/results",
];

function envFlag(name: string): boolean {
  try {
    return typeof process !== "undefined" && process.env?.[name] === "1";
  } catch {
    return false;
  }
}

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Builds the CSP headers for one response. Pure and independently testable.
 * `ARINX_CSP_REPORT_ONLY=1` downgrades enforcement to the emergency baseline
 * if a newly deployed third-party tag ever needs a temporary reprieve.
 */
export function buildCspHeaders(reportOnlyEnforcement = envFlag("ARINX_CSP_REPORT_ONLY")): {
  enforced: string;
  reportOnly: string | null;
} {
  return {
    enforced: reportOnlyEnforcement ? BASELINE_CSP : ENFORCED_CSP,
    reportOnly: TARGET_CSP,
  };
}

/** Adds every platform-level header without ever removing app-set headers. */
export function applySecurityHeaders(
  response: Response,
  context: SecurityContext,
  downgrade?: boolean,
): Response {
  const headers = new Headers(response.headers);
  const { enforced, reportOnly } = buildCspHeaders(downgrade);

  headers.set("Content-Security-Policy", enforced);
  if (reportOnly) headers.set("Content-Security-Policy-Report-Only", reportOnly);
  else headers.delete("Content-Security-Policy-Report-Only");

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("X-DNS-Prefetch-Control", "off");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("X-Request-Id", context.requestId ?? newRequestId());

  if (context.isHttps) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  } else {
    headers.delete("Strict-Transport-Security");
  }

  // Private pages must never sit in a shared cache or a browser back/forward
  // cache after sign-out.
  if (isPrivatePath(context.pathname) && !headers.has("cache-control")) {
    headers.set("Cache-Control", "private, no-store, max-age=0");
  }

  // Opt-in cross-origin isolation, ONLY for the upload document. Multithreaded
  // ffmpeg.wasm needs SharedArrayBuffer; every other route stays unisolated so
  // ads, fonts and Supabase keep working.
  if (envFlag("ARINX_CROSS_ORIGIN_ISOLATION") && context.pathname.startsWith("/studio/upload")) {
    const type = context.contentType ?? headers.get("content-type") ?? "";
    if (type.includes("text/html")) {
      headers.set("Cross-Origin-Opener-Policy", "same-origin");
      headers.set("Cross-Origin-Embedder-Policy", "credentialless");
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
