# Improve ArinX search discovery without a custom domain

## Goal
Grow search discovery on the existing `https://arin-x.lovable.app` address. Keep that address as the canonical origin; do not require or connect a custom domain, promise ranking gains, or make marketing changes outside the platform.

## Work
1. Review current search and preview evidence, then improve the highest-value public pages where content is genuinely thin or repetitive. Preserve distinct metadata, self-canonicals, structured video/channel data, crawlable internal links, sitemap/feed behavior, and the existing user-facing design.
2. Keep public videos and videos intentionally shared by Unlisted link playable. Resolve the flagged media-file exposure by restricting direct storage reads and providing only short-lived, server-authorized media links for content whose visibility permits access; preserve owner access and downloads. Private and unreferenced files remain unavailable to other visitors.
3. Add or update focused tests for public, Unlisted, private, and owner access, plus crawler metadata and sitemap/feed behavior. Run the relevant existing tests and inspect the preview before reporting what is ready.

## Technical details
- Keep route canonicals and sitemap URLs on `https://arin-x.lovable.app`.
- Reuse the existing TanStack Start and public-content data patterns; do not introduce a custom domain, external SEO service, or unrelated feature work.
- Keep signed media authorization server-side and validate video/profile visibility before creating an expiring access URL. Avoid broadening storage read policies to clear the scanner finding.
- Treat any analytics or search-volume estimates as directional; indexing, rankings, and visits are not guaranteed.
