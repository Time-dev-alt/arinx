import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handleSeoRequest } from "./lib/seo-routes.server";
import {
  applySecurityHeaders,
  isPrivatePath,
  newRequestId,
  type SecurityContext,
} from "./lib/security-headers.server";
import {
  clientKeyFromRequest,
  isStaticAssetPath,
  LIMITS,
  rateLimitedResponse,
  requestLimiter,
} from "@/lib/rate-limit";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

/** Extracts only non-sensitive fields from a CSP violation report. */
function safeCspSummary(raw: string): string {
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const report = (payload["csp-report"] ?? payload) as Record<string, unknown>;
    const host = (value: unknown) => {
      if (typeof value !== "string") return "<none>";
      try {
        return new URL(value).host;
      } catch {
        return "<invalid>";
      }
    };
    return JSON.stringify({
      directive: String(report["violated-directive"] ?? "").slice(0, 120),
      blocked: host(report["blocked-uri"]),
      document: host(report["document-uri"]),
      source: String(report["source-file"] ?? "").slice(0, 120),
    });
  } catch {
    return "<unparseable report>";
  }
}

async function handleCspReport(request: Request): Promise<Response> {
  const limited = requestLimiter.check(`csp:${clientKeyFromRequest(request)}`, LIMITS.cspReport);
  if (!limited.allowed) return rateLimitedResponse(limited);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > 16_384) return new Response(null, { status: 413 });
  try {
    const body = await request.text();
    if (body.length > 16_384) return new Response(null, { status: 413 });
    console.warn("[csp-report]", safeCspSummary(body));
  } catch {
    /* malformed reports are ignored, never surfaced */
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const requestId = newRequestId();
    let pathname = "/";
    let isHttps = false;
    try {
      const url = new URL(request.url);
      pathname = url.pathname;
      isHttps = url.protocol === "https:";
    } catch {
      /* malformed URL: still answer safely */
    }
    const context: SecurityContext = { pathname, isHttps, requestId };
    const harden = (response: Response) => {
      const enriched: SecurityContext = {
        ...context,
        contentType: response.headers.get("content-type"),
      };
      return applySecurityHeaders(response, enriched);
    };

    try {
      if (pathname === "/csp-report") {
        if (request.method !== "POST") return harden(new Response(null, { status: 405 }));
        return harden(await handleCspReport(request));
      }

      // Budget every dynamic request. Static assets are served by the platform
      // and are not charged against the SSR budget (dev HMR included).
      if (!isStaticAssetPath(pathname)) {
        const limited = requestLimiter.check(
          `doc:${clientKeyFromRequest(request)}`,
          LIMITS.document,
        );
        if (!limited.allowed) return harden(rateLimitedResponse(limited));
      }

      // Belt-and-braces: the request middleware normally handles these, but the
      // production entry also serves them so crawlers never hit a 404 sitemap.
      const seo = await handleSeoRequest(request);
      if (seo) {
        if (isPrivatePath(pathname)) seo.headers.set("Cache-Control", "no-store");
        return harden(seo);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return harden(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(`[${requestId}]`, error);
      return harden(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
