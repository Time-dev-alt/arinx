import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext } from "@/lib/api";

import appCss from "../styles.css?url";
import { DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE } from "../lib/site";
import { organizationJsonLd, webSiteJsonLd } from "../lib/seo";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { startWebVitals } from "@/lib/web-vitals";
import { AppShell } from "@/components/AppShell";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">This page isn't available</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be broken, or the video may have been removed.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ArinX — Watch, share and create videos online" },
      { name: "description", content: DEFAULT_DESCRIPTION },
      {
        name: "robots",
        content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      },
      // Head content deduplicates meta tags by name; one theme-color only.
      { name: "theme-color", content: "#0f0f0f" },
      { name: "color-scheme", content: "dark light" },
      { name: "application-name", content: "ArinX" },
      { name: "author", content: "ArinX" },
      { property: "og:title", content: "ArinX — Watch, share and create videos online" },
      { property: "og:description", content: DEFAULT_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "ArinX" },
      { property: "og:locale", content: "en_US" },
      { property: "og:image", content: DEFAULT_OG_IMAGE },
      // Dimensions are set per-route by pageHead(), which knows whether the
      // card is the branded 1200x630 image or a creator-supplied thumbnail.
      { property: "og:image:alt", content: "ArinX — watch, share and create videos" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: DEFAULT_OG_IMAGE },
      { "script:ld+json": webSiteJsonLd() },
      { "script:ld+json": organizationJsonLd() },
      // Google Search Console ownership proof. Set VITE_GOOGLE_SITE_VERIFICATION
      // in the deployment environment; no tag is emitted when it is absent.
      ...(import.meta.env.VITE_GOOGLE_SITE_VERIFICATION
        ? [
            {
              name: "google-site-verification",
              content: String(import.meta.env.VITE_GOOGLE_SITE_VERIFICATION).slice(0, 256),
            },
          ]
        : []),
      // HilltopAds verification tag — keep for the existing ad partnership.
      {
        name: "b38c5333923b048c5677322c38ed246322833031",
        content: "b38c5333923b048c5677322c38ed246322833031",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Outfit:wght@500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon", sizes: "256x256" },
      { rel: "apple-touch-icon", href: "/logo.png" },
      {
        rel: "alternate",
        type: "application/rss+xml",
        title: "ArinX — latest videos",
        href: "/feed.xml",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const [auth, setAuth] = useState<{ session: Session | null; ready: boolean }>({
    session: null,
    ready: false,
  });
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth({ session: data.session, ready: true }));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setAuth({ session, ready: true });
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      queryClient.invalidateQueries();
    });
    const stopVitals = startWebVitals();
    return () => {
      data.subscription.unsubscribe();
      stopVitals();
    };
  }, [queryClient, router]);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <AppShell>
          <Outlet />
        </AppShell>
        <Toaster />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
