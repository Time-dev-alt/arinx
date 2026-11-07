import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the PUBLISHABLE key only. Every read is
 * still constrained by RLS, so private videos, private media and owner-only
 * settings can never leak into SEO output or server-rendered HTML.
 * Never import this from a component — it is server-only.
 */
export function publicDbClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        const timeout =
          typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(8_000) : undefined;
        return fetch(input, {
          ...init,
          headers,
          ...(init?.signal || timeout ? { signal: init?.signal ?? timeout } : {}),
        });
      },
    },
  });
}
