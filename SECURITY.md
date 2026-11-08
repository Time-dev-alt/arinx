# Security policy

## Reporting a vulnerability

Please report security issues privately to **security@arin-x.lovable.app**.
Include a description, reproduction steps, affected URL and (if possible) a
proof of concept. Do **not** open a public issue for an unpatched vulnerability.

| Stage              | Target                                                |
| ------------------ | ----------------------------------------------------- |
| Acknowledgement    | 2 business days                                       |
| Initial assessment | 5 business days                                       |
| Fix or mitigation  | 30 days for high/critical, 90 days for lower severity |

Machine-readable contact details are published at
[`/.well-known/security.txt`](https://arin-x.lovable.app/.well-known/security.txt)
and mirrored as a static file at `public/.well-known/security.txt` so it is
reachable even when the ASSETS binding bypasses the SSR worker. This document is
mirrored at the
[GitHub security policy](https://github.com/Time-dev-alt/arinx/security/policy).
Acknowledgements are listed at
[security advisories](https://github.com/Time-dev-alt/arinx/security/advisories).

## Supported versions

Only the current `main` branch is supported. Fixes land on `main` and are
deployed to `https://arin-x.lovable.app`; there are no long-lived release lines.

## Platform controls

- **Strict CSP.** Production documents get a per-request 128-bit nonce and
  `script-src` with `'strict-dynamic'` and no `'unsafe-inline'` / `'unsafe-eval'`.
  A stricter Report-Only policy (`require-trusted-types-for 'script'`, narrow
  `frame-ancestors`) runs alongside it. Violations land at the rate-limited
  `POST /csp-report`. Static assets served by the Cloudflare ASSETS binding
  use the mirrored policy in `public/_headers`.
- **Defence in depth.** `nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  `Cross-Origin-Resource-Policy`, HSTS on HTTPS, `private, no-store` on
  authenticated routes, per-request `X-Request-Id`, explicit CSRF middleware,
  bounded server-function bodies, and per-client rate limits on every dynamic
  route.
- **Ad markup.** Owner-supplied HTML is allowlist-sanitized, imported as DOM
  nodes (never `innerHTML`), re-created as nonce-bearing scripts, and guarded
  by an HTTPS-only URL validator. First-party CSS is emitted as text rather
  than through an HTML sink.
- **Uploads.** Client-side magic-byte and MIME validation plus bounded sizes.
  The authoritative controls are PostgreSQL constraints and a
  `storage.objects` trigger in `drizzle/migrations/0014_enterprise_constraints.sql`.
- **Database.** Row Level Security on every public table; owner-scoped reads,
  writes and storage objects; admin-only settings writes recorded in an
  append-only `public.security_audit` table.
- **Supply chain.** Pinned SHA-256 digests for every ffmpeg WASM asset,
  verified at runtime before execution; production dependencies audited in CI.

## Out of scope

- Watermarks and baked-in fingerprints are deterrence and attribution, **not
  DRM**. Removing them from a downloaded file is always possible.
- Reports about the third-party ad networks themselves should go to those
  providers; we can only disable or replace their tags.
- Denial-of-service testing against the live origin, social engineering and
  physical attacks.

## Operator checklist

See [`docs/runbook.md`](docs/runbook.md) for deployment, incident response and
the migrations that must be applied in the live database.
