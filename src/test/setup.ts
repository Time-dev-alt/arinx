import "@testing-library/jest-dom/vitest";
import { webcrypto } from "node:crypto";

// jsdom does not ship SubtleCrypto; the encoder verifies WASM bytes with it.
if (typeof globalThis.crypto?.subtle?.digest !== "function") {
  try {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: webcrypto,
    });
  } catch {
    /* some jsdom versions expose a non-configurable crypto getter */
  }
}

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
