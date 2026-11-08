import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import {
  clientKeyFromRequest,
  LIMITS,
  rateLimitedResponse,
  requestLimiter,
} from "@/lib/rate-limit";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * Per-server-function abuse shield. Server functions are the only DB-backed
 * RPCs in the app, so they get their own budget (tighter than page loads) and a
 * body-size ceiling. Returning a Response from a request middleware is
 * supported by Start, so a flooded client receives a real 429, not a 500.
 */
const abuseMiddleware = createMiddleware().server(
  async ({ next, request, handlerType, serverFnMeta }) => {
    if (handlerType !== "serverFn") return next();
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declared) && declared > 1_048_576) {
      return new Response("Payload Too Large", {
        status: 413,
        headers: { "cache-control": "no-store" },
      });
    }
    const key = `fn:${clientKeyFromRequest(request)}:${serverFnMeta?.id ?? "unknown"}`;
    const limited = requestLimiter.check(key, LIMITS.serverFunction);
    if (!limited.allowed) return rateLimitedResponse(limited);
    return next();
  },
);

// Crawler-facing endpoints (robots.txt, sitemap.xml, feed.xml and the stable
// thumbnail proxy) must be served before the SSR router, in both dev and
// production. The handler is dynamically imported so no server-only code leaks
// into the browser bundle.
const seoRoutesMiddleware = createMiddleware().server(async ({ next }) => {
  const request = getRequest();
  if (!request) return next();
  const { handleSeoRequest } = await import("@/lib/seo-routes.server");
  const response = await handleSeoRequest(request);
  return response ?? next();
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, abuseMiddleware, seoRoutesMiddleware, csrfMiddleware],
}));
