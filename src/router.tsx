import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { getRequestContext } from "@/lib/request-context";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  // On the server the SSR entry runs each request inside an AsyncLocalStorage
  // scope carrying a unique CSP nonce. TanStack Start forwards this option to
  // React's renderer (bootstrap scripts), HeadContent (meta[property=csp-nonce]
  // and head assets), and router-core's client loader reads that meta back.
  // On the client this returns undefined and router-core fills the nonce from
  // the emitted meta tag itself.
  const nonce = getRequestContext()?.nonce;

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ...(nonce ? { ssr: { nonce } } : {}),
  });

  return router;
};
