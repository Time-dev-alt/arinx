/**
 * Central response-hardening policy for the SSR entry.
 *
 * Production documents get a per-request nonce and a strict `script-src`
 * without `'unsafe-inline'` / `'unsafe-eval'`. TanStack Start forwards
 * `router.options.ssr.nonce` to React's SSR renderer (which nonces every
 * bootstrap script), to `HeadContent` (which emits `meta[property=csp-nonce]`
 * and nonces head assets), and router-core's client loader reads that meta back
 * for dynamically created scripts. Third-party ad scripts are injected by the
 * nonce-bearing app bundle, so `'strict-dynamic'` permits them without a host
 * allowlist. Host/`'self'` sources are retained for CSP2 browsers.
 *
 * Dev is deliberately downgraded to the compatibility policy: Vite's HMR and
 * React Refresh preamble are inline scripts the framework cannot nonce.
 *
 * Deliberately avoided:
 *  - X-Frame-Options: the Lovable editor embeds the app and /embed/:id is a
 *    public, frameable player. frame-ancestors lives in the CSP.
 *  - COOP / COEP by default: cross-origin isolation breaks ads, fonts and
 *    Supabase. Opt-in, scoped to /studio/upload, for multithreaded ffmpeg.wasm.
 */

export interface SecurityContext {
  pathname: string;
  isHttps: boolean;
  requestId?: string;
  /** Response content type, when already known. */
  contentType?: string | null;
}

export interface SecurityOptions {
  /** Emergency downgrade to the minimal baseline (ARINX_CSP_REPORT_ONLY=1). */
  downgrade?: boolean;
  /** Vite dev server: allow inline/eval scripts that cannot be nonced. */
  dev?: boolean;
  /** Per-response CSP nonce. Omit for non-document responses. */
  nonce?: string;
  /** Promote Trusted Types from Report-Only to enforcement. */
  trustedTypes?: boolean;
}

const NARROW_FRAME_ANCESTORS = [
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

interface PolicyOptions {
  nonce?: string;
  dev?: boolean;
  trustedTypes?: boolean;
  narrowFrameAncestors?: boolean;
}

function buildPolicy(options: PolicyOptions = {}): string {
  const { nonce, dev, trustedTypes, narrowFrameAncestors } = options;
  const scriptSources = [
    "'self'",
    ...(nonce ? [`'nonce-${nonce}'`, "'strict-dynamic'"] : []),
    ...(dev ? ["'unsafe-inline'", "'unsafe-eval'"] : []),
    // Kept for CSP1/2 browsers, which ignore 'strict-dynamic'.
    "https:",
    "blob:",
  ].join(" ");

  return [
    "default-src 'self' https: blob: data:",
    `script-src ${scriptSources}`,
    // Inline style attributes are governed by this directive and are used by
    // every React component, so 'unsafe-inline' stays here by design.
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
    `frame-ancestors ${narrowFrameAncestors ? NARROW_FRAME_ANCESTORS : "'self' https:"}`,
    ...(trustedTypes ? ["require-trusted-types-for 'script'"] : []),
    "report-uri /csp-report",
  ].join("; ");
}

/**
 * Static asset policy (no nonce — static files are not documents).
 * `public/_headers` mirrors these two strings for responses served directly
 * from the Cloudflare ASSETS binding.
 */
export const ENFORCED_CSP = buildPolicy();
export const TARGET_CSP = buildPolicy({ trustedTypes: true, narrowFrameAncestors: true });
/** Vite dev compatibility policy. */
export const DEV_CSP = buildPolicy({ dev: true });

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
 * `ARINX_CSP_REPORT_ONLY=1` downgrades enforcement to the emergency baseline.
 * `ARINX_TRUSTED_TYPES=1` promotes Trusted Types once the ad tags are clean.
 */
export function buildCspHeaders(
  reportOnlyEnforcement = envFlag("ARINX_CSP_REPORT_ONLY"),
  options: { nonce?: string; dev?: boolean; trustedTypes?: boolean } = {},
): { enforced: string; reportOnly: string | null } {
  const trustedTypes = options.trustedTypes ?? envFlag("ARINX_TRUSTED_TYPES");
  const enforced = reportOnlyEnforcement
    ? BASELINE_CSP
    : options.dev
      ? DEV_CSP
      : buildPolicy({ nonce: options.nonce, trustedTypes });

  // Report-Only always ships the strictest target so Trusted Types violations
  // and framing outside the allowlist keep surfacing until the stream is clean.
  // It carries the same nonce, otherwise first-party scripts would flood it.
  const reportOnly = buildPolicy({
    nonce: options.nonce,
    trustedTypes: true,
    narrowFrameAncestors: true,
  });

  return { enforced, reportOnly: reportOnly === enforced ? null : reportOnly };
}

/** Adds every platform-level header without ever removing app-set headers. */
export function applySecurityHeaders(
  response: Response,
  context: SecurityContext,
  options: SecurityOptions = {},
): Response {
  const headers = new Headers(response.headers);
  const downgrade = options.downgrade ?? envFlag("ARINX_CSP_REPORT_ONLY");
  const { enforced, reportOnly } = buildCspHeaders(downgrade, {
    nonce: options.nonce,
    dev: options.dev,
    trustedTypes: options.trustedTypes,
  });

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

  // Opt-in cross-origin isolation, ONLY for the upload document.
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
