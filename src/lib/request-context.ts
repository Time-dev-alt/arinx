/**
 * Isomorphic per-request context slot.
 *
 * `src/server.ts` registers a real AsyncLocalStorage (Node or the Cloudflare
 * `nodejs_compat` runtime) at startup. `src/router.tsx` reads it from the
 * client-safe module below, so no `node:*` import ever reaches the browser
 * bundle. TanStack Start already relies on `node:async_hooks` for its own
 * request context, so the runtime guarantee is shared with the framework.
 */

export interface ArinXRequestContext {
  requestId: string;
  /** Base64 CSP nonce for this exact response. */
  nonce: string;
}

interface ContextStore {
  run<T>(context: ArinXRequestContext, fn: () => T): T;
  getStore(): ArinXRequestContext | undefined;
}

const SLOT = Symbol.for("arinx:request-context");
const holder = globalThis as typeof globalThis & { [SLOT]?: ContextStore };

/** Called once by the SSR entry. Safe to call repeatedly (idempotent). */
export function registerRequestContextStore(store: ContextStore): void {
  holder[SLOT] = store;
}

export function runWithRequestContext<T>(context: ArinXRequestContext, fn: () => T): T {
  const store = holder[SLOT];
  return store ? store.run(context, fn) : fn();
}

export function getRequestContext(): ArinXRequestContext | undefined {
  return holder[SLOT]?.getStore();
}

/** 128 bits of entropy, base64 encoded, regenerated on every response. */
export function newCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
