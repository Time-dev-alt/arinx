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

The SSR entry applies one shared security policy to every response: an enforced
CSP, a stricter Report-Only target CSP, `Permissions-Policy`, `Referrer-Policy`,
`nosniff`, `Cross-Origin-Resource-Policy`, a per-request id, HSTS on HTTPS, and
`private, no-store` on authenticated surfaces. CSP violations are accepted at
the rate-limited `POST /csp-report` endpoint and logged as host-only summaries.

- `ARINX_CSP_REPORT_ONLY=1` downgrades enforcement to the emergency baseline
  if a newly deployed third-party tag needs a temporary reprieve.
- `ARINX_CROSS_ORIGIN_ISOLATION=1` enables COOP/COEP on `/studio/upload` only,
  which unlocks the multithreaded ffmpeg core. Leave it off unless you have
  verified that ads, fonts and Supabase still work inside the isolated page.
- `ARINX_DEMO_DATA=1` serves local seed content for previews; production uses
  real public rows only.
- Copy `.env.example` to `.env.local` for local overrides. The tracked `.env`
  contains publishable keys only — never add a service-role key or secret to
  any committed env file.

Rate limits (`src/lib/rate-limit.ts`) are process-local fixed windows. They stop
single-source floods without a database round trip; on Cloudflare each isolate
keeps its own budget. Replace the limiter with a KV namespace or Durable Object
when globally exact quotas are required.

The upload encoder verifies every byte of `@ffmpeg/core@0.12.6` against pinned
SHA-256 digests before WASM executes, tries three CDN mirrors, prefers the
multithreaded core on isolated pages, falls back to single-thread, serializes
jobs behind one shared instance, supports cancellation and a hard 15-minute
timeout, and validates the resulting MP4 signature. Watermark layers are
pre-rendered at their final size so the filter graph never rescales per frame;
a visible mark, an invisible forensic tile and metadata fingerprints are baked
into every output.

Static files served through the Cloudflare `ASSETS` binding bypass the SSR
worker, so `public/_headers` mirrors the enforced and Report-Only CSP plus the
remaining platform headers. A unit test asserts that file stays in sync with
`src/lib/security-headers.server.ts`.

Crawler endpoints are served from both the SSR entry and the request
middleware so they cannot 404: `/robots.txt`, `/sitemap.xml`,
`/sitemap-pages.xml`, `/sitemap-channels.xml`,
`/sitemap-videos.xml?page=N`, `/feed.xml` (RSS 2.0 + Media RSS) and the stable
`/media/thumbnail/:id` redirect.

Verify a change with:

```sh
npm install --legacy-peer-deps
npx prettier --check "src/**/*.{ts,tsx}"
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Known follow-ups: wire a per-request CSP nonce through TanStack Router before
promoting the target CSP to enforcement; apply migration `0011` in the live
database; claim Google Search Console and submit `/sitemap.xml`; add a real
provider VAST tag test; and move abuse limits to shared edge state.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
