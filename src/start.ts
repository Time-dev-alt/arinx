import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

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

// Crawler-facing endpoints (sitemap.xml and the stable thumbnail proxy) must be
// served before the SSR router, in both dev and production. The handler is
// dynamically imported so no server-only code leaks into the browser bundle.
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
  requestMiddleware: [errorMiddleware, seoRoutesMiddleware, csrfMiddleware],
}));
