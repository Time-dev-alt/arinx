import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRobotsTxt } from "@/lib/sitemap";
import { ENFORCED_CSP, PERMISSIONS_POLICY, TARGET_CSP } from "@/lib/security-headers.server";

const root = process.cwd();

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (/\.(?:ts|tsx)$/.test(entry) && !entry.includes(".test.")) {
      out.push(path);
    }
  }
  return out;
}

const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("committed-source invariants", () => {
  it("keeps static robots.txt identical to the dynamic policy", () => {
    expect(read("public/robots.txt")).toBe(buildRobotsTxt());
  });

  it("never commits a secret key, token, or private key", () => {
    const files = [
      ".env",
      ".env.example",
      ".gitignore",
      "package.json",
      ...sourceFiles(resolve(root, "src")).map((file) => relative(root, file)),
    ];
    const secretPatterns = [
      /sb_secret_[A-Za-z0-9_-]{20,}/,
      /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'][^"']{20,}["']/,
      /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./,
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
      /sk_live_[A-Za-z0-9]{16,}/,
      /AKIA[0-9A-Z]{16}/,
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const content = read(file);
      for (const pattern of secretPatterns) {
        if (pattern.test(content)) offenders.push(`${file}: ${pattern.source}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("ignores local env overrides while keeping the publishable-key .env tracked", () => {
    const ignore = read(".gitignore");
    expect(ignore).toContain(".env.local");
    expect(ignore).toContain("!.env.example");
    expect(read(".env")).not.toMatch(/SERVICE_ROLE|sb_secret_|PRIVATE KEY/);
    expect(read(".env.example")).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
  });

  it("mirrors the SSR security policy on static assets via public/_headers", () => {
    // Cloudflare serves public/* through the ASSETS binding, bypassing
    // applySecurityHeaders(). The static header file is the only way to keep
    // those responses hardened; this test prevents policy drift.
    const headers = read("public/_headers");
    expect(headers).toContain(`  Content-Security-Policy: ${ENFORCED_CSP}`);
    expect(headers).toContain(`  Content-Security-Policy-Report-Only: ${TARGET_CSP}`);
    expect(headers).toContain(`  Permissions-Policy: ${PERMISSIONS_POLICY}`);
    expect(headers).toContain("  Strict-Transport-Security: max-age=31536000");
    expect(headers).toContain("  X-Content-Type-Options: nosniff");
  });

  it("has no innerHTML DOM sink outside the CSS-generating chart helper", () => {
    const offenders = sourceFiles(resolve(root, "src"))
      .filter((file) => !file.endsWith(`${join("ui", "chart.tsx")}`))
      .filter((file) => /\.(?:innerHTML|outerHTML)\s*=/.test(readFileSync(file, "utf8")));
    expect(offenders.map((file) => relative(root, file))).toEqual([]);
  });

  it("does not reintroduce conflicting or slow legacy constructs", () => {
    for (const file of sourceFiles(resolve(root, "src"))) {
      const content = readFileSync(file, "utf8");
      // /results is Disallow + noindex; a SearchAction pointing at it is a
      // contradictory tag that Google ignores.
      expect(content).not.toMatch(/"@type"\s*:\s*"SearchAction"/);
      // scale2ref rescaled a full-size watermark layer on every single frame.
      expect(content).not.toMatch(/\[1:v\]scale2ref|scale2ref\[/);
    }
  });

  it("renders the feed link and a single deduplicable theme-color tag", () => {
    const rootRoute = read("src/routes/__root.tsx");
    expect(rootRoute).toContain('"application/rss+xml"');
    expect(rootRoute).toContain("/feed.xml");
    expect(rootRoute).toContain("color-scheme");
    // HeadContent deduplicates <meta> by name; a second theme-color with a
    // different `media` would be silently dropped by TanStack Router.
    expect(rootRoute.match(/name: "theme-color"/g)).toHaveLength(1);
  });
});
