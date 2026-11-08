/**
 * Operational endpoints served by the SSR worker before the router.
 *
 *  GET  /healthz                    liveness (no dependencies)
 *  GET  /readyz                    readiness + deployment mode
 *  GET  /.well-known/security.txt  coordinated disclosure (RFC 9116)
 *  POST /rum                       Core Web Vitals beacon (no PII stored)
 *
 * All responses are `no-store`. The RUM endpoint is validated, bounded and
 * rate limited so an attacker cannot use it as a log-flooding primitive.
 */
import { DEMO_MODE } from "@/lib/demo-data";
import { checkRateLimit } from "@/lib/rate-limit-backend";
import { clientKeyFromRequest, LIMITS, rateLimitedResponse } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/site";

const SECURITY_TXT = `Contact: mailto:security@arin-x.lovable.app
Expires: 2030-01-01T00:00:00.000Z
Preferred-Languages: en
Canonical: ${SITE_URL}/.well-known/security.txt
Policy: https://github.com/Time-dev-alt/arinx/security/policy
Acknowledgements: https://github.com/Time-dev-alt/arinx/security/advisories
`;

const RUM_METRICS = new Set(["LCP", "CLS", "INP", "FCP", "TTFB", "LONG_TASK"]);
const MAX_RUM_BODY = 2_048;

const opsHeaders = (contentType: string) => ({
  "content-type": contentType,
  "cache-control": "no-store, max-age=0",
  "x-content-type-options": "nosniff",
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: opsHeaders("application/json; charset=utf-8"),
  });
}

function isOpsPath(pathname: string): boolean {
  return (
    pathname === "/healthz" ||
    pathname === "/readyz" ||
    pathname === "/.well-known/security.txt" ||
    pathname === "/rum"
  );
}

export { isOpsPath };

/** Structured, PII-free log line. */
export function logEvent(event: string, fields: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", event, ...fields }));
  } catch {
    /* logging must never break a response */
  }
}

async function handleRum(request: Request): Promise<Response> {
  const limited = await checkRateLimit(`rum:${clientKeyFromRequest(request)}`, LIMITS.cspReport);
  if (!limited.allowed) return rateLimitedResponse(limited);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_RUM_BODY) {
    return new Response(null, { status: 413 });
  }
  let payload: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > MAX_RUM_BODY) return new Response(null, { status: 413 });
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    payload = parsed as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }

  const metric = typeof payload.metric === "string" ? payload.metric : "";
  const value = Number(payload.value);
  const path = typeof payload.path === "string" ? payload.path.slice(0, 200) : "";
  if (!RUM_METRICS.has(metric) || !Number.isFinite(value) || value < 0 || value > 3_600_000) {
    return new Response(null, { status: 400 });
  }
  if (!/^\/[A-Za-z0-9/_\-.?=&%]*$/.test(path)) return new Response(null, { status: 400 });

  logEvent("rum", { metric, value: Math.round(value), path });
  return new Response(null, { status: 204, headers: opsHeaders("text/plain") });
}

export async function handleOpsRequest(request: Request): Promise<Response | null> {
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return null;
  }
  if (!isOpsPath(pathname)) return null;

  const method = request.method;
  if (pathname === "/rum") {
    if (method !== "POST")
      return new Response(null, { status: 405, headers: opsHeaders("text/plain") });
    return handleRum(request);
  }
  if (method !== "GET" && method !== "HEAD") {
    return new Response(null, { status: 405, headers: opsHeaders("text/plain") });
  }

  if (pathname === "/healthz") {
    return json({ status: "ok", service: "arinx", mode: DEMO_MODE ? "demo" : "live" });
  }
  if (pathname === "/readyz") {
    return json({
      status: "ready",
      service: "arinx",
      mode: DEMO_MODE ? "demo" : "live",
      // Deliberately dependency-free: a DB outage must not take the whole
      // deployment out of the load balancer. Crawler routes degrade to an
      // empty catalog on their own.
      checks: { ssr: "ok" },
    });
  }
  return new Response(SECURITY_TXT, {
    status: 200,
    headers: opsHeaders("text/plain; charset=utf-8"),
  });
}
