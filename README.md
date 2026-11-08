# Arin X

Build ArinX: an open-source, full-featured recreation of YouTube's core product workflows as a modern, responsive web application.

Key capabilities to implement:

1. Navigation & Browsing:

- Home feed with category pills, personalized recommendations, trending, and subscriptions feed
- Search bar with autocomplete suggestions, query handling, and result filtering (by type, upload date, duration)
- Shorts-style vertical video experience with vertical scroll/snap, like, comment, and sound controls
- Channel pages with banner, avatar, tabs (Home, Videos, Shorts, Playlists, Community, About), and Subscribe functionality
- User Library and History: Watch history, Liked videos, Watch Later, and custom playlists

2. Video Playback & Watch Experience:

- Full-featured custom video player with play/pause, scrub bar, volume, playback speed, theater mode, full-screen, and picture-in-picture
- Video details section: title, view count, timestamp, like/dislike buttons, share, save to playlist, channel card with subscriber count
- Expandable description box with timestamps and tags
- Comment section with threaded replies, sorting (top vs newest), and comment creation
- Up next / Related videos recommendation sidebar

3. Creator Studio & Upload Flow:

- Video upload workflow: file upload, title, description, thumbnail upload/selection, category, visibility (public, unlisted, private)
- Channel customization: profile picture, banner, channel name, handle, and bio
- Creator dashboard with video management (edit metadata, delete, change visibility) and channel analytics (views, watch time, subscribers)

4. Design & Polish:

- High-fidelity YouTube-inspired dark and light theme interface
- Collapsible sidebar navigation (Home, Shorts, Subscriptions, Library, History, Your videos, Watch later, Liked videos)
- Realistic seed data with high-quality video streams, channels, comments, and diverse categories to ensure the platform feels alive immediately

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://arin-x.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9a8aec90-fd30-4c40-bb8e-25cd7ec9e85c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Platform hardening

### Strict, nonce-based CSP

Every production response gets a **per-request 128-bit nonce**. `src/server.ts`
opens an `AsyncLocalStorage` scope for the request, `src/router.tsx` forwards
that nonce as `router.options.ssr.nonce`, and TanStack Start passes it to
React's renderer, `HeadContent`, head assets and the client loader (which reads
`meta[property="csp-nonce"]`). The enforced policy is
`script-src 'self' 'nonce-…' 'strict-dynamic' https: blob:` — **no
`'unsafe-inline'`, no `'unsafe-eval'`**. Vite dev downgrades to a compatibility
policy because the HMR / React Refresh preamble cannot be nonced.

A stricter Report-Only policy (`require-trusted-types-for 'script'` plus a
narrow `frame-ancestors` allowlist) ships alongside it so any regression is
visible at `POST /csp-report` before promotion. A source-invariant test asserts
`public/_headers` stays in sync with the static policies for assets served
directly by the Cloudflare `ASSETS` binding.

- `ARINX_CSP_REPORT_ONLY=1` downgrades enforcement to the emergency baseline
  if a newly deployed third-party tag needs a temporary reprieve.
- `ARINX_TRUSTED_TYPES=1` promotes Trusted Types from Report-Only to
  enforcement once the ad tags are clean.
- `ARINX_CROSS_ORIGIN_ISOLATION=1` enables COOP/COEP on `/studio/upload` only,
  which unlocks the multithreaded ffmpeg core. Leave it off unless you have
  verified that ads, fonts and Supabase still work inside the isolated page.
- `ARINX_DEMO_DATA=1` serves local seed content for previews; production uses
  real public rows only.
- `VITE_GOOGLE_SITE_VERIFICATION=<token>` emits the Google Search Console
  ownership meta tag. No tag is emitted when it is unset.
- Copy `.env.example` to `.env.local` for local overrides. The tracked `.env`
  contains publishable keys only — never add a service-role key or secret to
  any committed env file.

All responses also carry `Permissions-Policy`, `Referrer-Policy`, `nosniff`,
`Cross-Origin-Resource-Policy`, a per-request `X-Request-Id`, HSTS on HTTPS,
and `private, no-store` on authenticated surfaces. Every request emits a
structured JSON log line (method, path, status, duration, limiter backend,
request id) with no PII.

### Operational endpoints

| Path                            | Purpose                                        |
| ------------------------------- | ---------------------------------------------- |
| `GET /healthz`                  | dependency-free liveness                       |
| `GET /readyz`                   | readiness plus deployment mode                 |
| `GET /.well-known/security.txt` | RFC 9116 coordinated disclosure                |
| `POST /rum`                     | validated, rate-limited Core Web Vitals beacon |
| `POST /csp-report`              | bounded, rate-limited CSP violation reporting  |

The browser-side probe in `src/lib/web-vitals.ts` reports LCP, CLS, INP, FCP,
TTFB and long tasks using `PerformanceObserver` + `sendBeacon`. Only a metric
name, a rounded number and the pathname leave the browser — no query strings,
identifiers or referrers. Export the `/rum` log stream to your analytics
backend of choice.

### Globally exact rate limits

`src/lib/rate-limit-backend.ts` gives every call site a single `checkRateLimit()`
function and selects the backend from the platform bindings on each request, in
priority order:

1. `ARINX_RATE_LIMITER` — Cloudflare's native Rate Limiting API (atomic across
   all isolates; **recommended**)
2. `ARINX_RATE_LIMITS_DO` — `ArinXRateLimiterDO` in
   `src/worker/rate-limiter-do.ts`, sharded by client key
3. `ARINX_RATE_LIMITS_KV` — KV namespace with per-window TTL keys
4. process-local fixed window — always-available fallback

Backend failures fail **open** to the local limiter. See
`wrangler.example.jsonc` for the binding configuration. Without a binding the
platform behaves exactly as before, so adding one upgrades quotas globally
without an application-code change.

### Server-side enforcement

`drizzle/migrations/0012_enterprise_constraints.sql` moves validation into
PostgreSQL where a modified browser client cannot bypass it: HTTPS-only and
bounded owner settings, enum allowlists, a `storage.objects` trigger enforcing
owner-scoped filenames, MIME types and size ceilings, video metadata bounds,
and an immutable admin audit trail. The client-side magic-byte check in
`src/lib/file-signatures.ts` is the fast first line of defence; the database
trigger is authoritative. **Apply `0011` and `0012` in the live database.**

### Encoder and crawler surfaces

The upload encoder verifies every byte of `@ffmpeg/core@0.12.6` against pinned
SHA-256 digests before WASM executes, tries three CDN mirrors, prefers the
multithreaded core on isolated pages, falls back to single-thread, serializes
jobs behind one shared instance, supports cancellation and a hard 15-minute
timeout, and validates the resulting MP4 signature. Watermark layers are
pre-rendered at their final size so the filter graph never rescales per frame;
a visible mark, an invisible forensic tile and metadata fingerprints are baked
into every output.

Crawler endpoints are served from both the SSR entry and the request
middleware so they cannot 404: `/robots.txt`, `/sitemap.xml`,
`/sitemap-pages.xml`, `/sitemap-channels.xml`,
`/sitemap-videos.xml?page=N`, `/feed.xml` (RSS 2.0 + Media RSS) and the stable
`/media/thumbnail/:id` redirect.

Verify a change with:

```sh
npm install --legacy-peer-deps --no-audit --no-fund
npx prettier --check .
npx tsc --noEmit
npm run lint
npm test
npm run build
```

### Remaining operator work (needs credentials / live access)

- Apply migrations `0011` and `0012` in the live Supabase database, then smoke
  test the live `https://arin-x.lovable.app` origin.
- Bind `ARINX_RATE_LIMITER` (or the Durable Object) in the deployed Wrangler
  config for globally exact quotas.
- Claim Google Search Console, set `VITE_GOOGLE_SITE_VERIFICATION`, submit
  `/sitemap.xml`, and connect the `/rum` stream to analytics.
- Run a real-provider VAST tag and a browser encoder benchmark on production
  media; add server-side codec/virus scanning if the platform gains a backend
  upload pipeline.
- Visual design refresh (awaiting direction).

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
