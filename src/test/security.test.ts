import { describe, expect, it } from "vitest";
import { sanitizeAdMarkup, sanitizeSearchTerm } from "@/lib/sanitize";
import {
  safeExternalUrl,
  safeHttpsUrl,
  safeStorageObjectPath,
  startSeconds,
} from "@/lib/watch-tools";

describe("ad snippet sanitizer", () => {
  it("keeps HTTPS script tags and upgrades protocol-relative URLs", () => {
    const out = sanitizeAdMarkup(
      '<script type="text/javascript" src="https://cdn.example.com/invoke.js"></script>' +
        '<script src="//ads.example.com/tag.js"></script>',
    );
    expect(out).toContain('src="https://cdn.example.com/invoke.js"');
    expect(out).toContain('src="https://ads.example.com/tag.js"');
    expect(out).toContain('type="text/javascript"');
  });

  it("keeps plain ad-network config object literals", () => {
    const out = sanitizeAdMarkup(
      `<script>atOptions = { 'key': 'abc123', 'format': 'iframe', 'height': 250 };</script>`,
    );
    expect(out).toContain("atOptions");
    expect(out).toContain("abc123");
  });

  it("drops executable URLs, inline JS, event handlers and unknown elements", () => {
    const out = sanitizeAdMarkup(
      '<img src="x" onerror="alert(1)" />' +
        '<script src="javascript:alert(1)"></script>' +
        '<script>document.write("<script src=//evil.example/x.js></scr"+"ipt>")</script>' +
        "<div onclick=\"fetch('//evil.example')\"><script>alert(1)</script></div>" +
        '<iframe src="https://evil.example"></iframe>',
    );
    expect(out).not.toMatch(/onerror|onclick|javascript:|document|iframe|alert|fetch/);
    expect(out).toBe("<div></div>");
  });

  it("allows inert ad containers without executable attributes", () => {
    const out = sanitizeAdMarkup(
      '<div id="container-abc" class="ad"><ins data-ad-slot="1"></ins></div>',
    );
    expect(out).toContain('id="container-abc"');
    expect(out).toContain("data-ad-slot");
  });

  it("returns empty markup when there is nothing safe to render", () => {
    expect(sanitizeAdMarkup("")).toBe("");
    expect(sanitizeAdMarkup("<script>alert(1)</script>")).toBe("");
  });
});

describe("PostgREST search term whitelist", () => {
  it("removes filter metacharacters", () => {
    expect(sanitizeSearchTerm('a%,()"\\b')).toBe("a b");
    expect(sanitizeSearchTerm("music,handle.eq.foo")).toBe("music handle.eq.foo");
  });

  it("caps the length of the term", () => {
    expect(sanitizeSearchTerm("a".repeat(500))).toHaveLength(60);
  });
});

describe("external URL validation", () => {
  it("accepts web links but rejects executable schemes and credentials", () => {
    expect(safeExternalUrl("https://example.com/path")).toBe("https://example.com/path");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,<script>")).toBeNull();
    expect(safeExternalUrl("https://user:pass@example.com")).toBeNull();
    expect(safeExternalUrl("https://example.com\nSet-Cookie: x")).toBeNull();
  });

  it("enforces HTTPS where media/scripts are fetched", () => {
    expect(safeHttpsUrl("https://example.com/tag.xml")).toBe("https://example.com/tag.xml");
    expect(safeHttpsUrl("http://example.com/tag.xml")).toBeNull();
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects absurd playback positions", () => {
    expect(startSeconds(Infinity)).toBe(0);
    expect(startSeconds(1e300)).toBe(0);
    expect(startSeconds("90")).toBe(90);
  });
});

describe("thumbnail storage path validation", () => {
  it("accepts relative object keys and rejects redirect destinations", () => {
    expect(safeStorageObjectPath("user-id/thumb.jpg")).toBe("user-id/thumb.jpg");
    expect(safeStorageObjectPath("https://evil.example/payload")).toBeNull();
    expect(safeStorageObjectPath("//evil.example/payload")).toBeNull();
    expect(safeStorageObjectPath("../outside.jpg")).toBeNull();
    expect(safeStorageObjectPath("user-id\\thumb.jpg")).toBeNull();
  });
});
