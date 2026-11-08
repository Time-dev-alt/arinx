# Operations runbook

## Deployments

1. CI must be green: `prettier --check .`, `tsc --noEmit`, `eslint .`,
   `vitest run`, `vite build`, and `npm audit --omit=dev --audit-level=high`.
   A ready-to-use GitHub Actions definition lives at `docs/ci.yml.example`.
   Copy it to `.github/workflows/ci.yml` with an account token that has the
   `workflows` scope (the Arena GitHub App token here cannot create workflow
   files). Until it is installed, run the same commands locally before merging.
2. Merge to `main`. Lovable syncs and publishes to
   `https://arin-x.lovable.app`.
3. Smoke test after every publish (replace the host if a custom domain is
   added):

```sh
BASE=https://arin-x.lovable.app
for p in / /healthz /readyz /.well-known/security.txt /robots.txt \
         /sitemap.xml /sitemap-pages.xml /sitemap-channels.xml \
         /sitemap-videos.xml /feed.xml /media/thumbnail/11111111-1111-4111-8111-111111111111; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")" "$p"
done
curl -sI "$BASE/" | grep -i 'content-security-policy\|strict-transport-security\|x-request-id'
```

Expected: every path is `200` except the thumbnail redirect (`302`), the
enforced CSP contains a `'nonce-…'` and `'strict-dynamic'`, and no
`'unsafe-eval'`. The nonce must differ between two consecutive requests.

4. Check that the HTML contains `meta[property="csp-nonce"]` with **the same**
   value as the header, and that every executable `<script>` carries that
   nonce. A mismatch means `router.options.ssr.nonce` stopped propagating.

## Environment flags

| Variable                        | Effect                                          | Default           |
| ------------------------------- | ----------------------------------------------- | ----------------- |
| `ARINX_CSP_REPORT_ONLY`         | Downgrade enforcement to the emergency baseline | off               |
| `ARINX_TRUSTED_TYPES`           | Promote Trusted Types to enforcement            | off (Report-Only) |
| `ARINX_CROSS_ORIGIN_ISOLATION`  | COOP/COEP on `/studio/upload` only              | off               |
| `ARINX_DEMO_DATA`               | Local seed content                              | off               |
| `VITE_GOOGLE_SITE_VERIFICATION` | GSC ownership meta tag                          | unset             |

Rate-limit bindings (`ARINX_RATE_LIMITER`, `ARINX_RATE_LIMITS_DO`,
`ARINX_RATE_LIMITS_KV`) are auto-detected from the platform env; see
`wrangler.example.jsonc`. Without a binding, quotas are isolate-local.

## Database migrations (one-time, needs owner access)

Apply in order in the Supabase SQL editor or with `supabase db push`:

1. `0011_harden_public_content.sql` — published-only storage and comment reads.
2. `0012_enterprise_constraints.sql` — settings constraints, storage object
   validation trigger, video bounds, admin audit trail.

`0012` adds all CHECK constraints as `NOT VALID` so historical rows are not
rejected. After backfilling/cleaning legacy rows, optionally run
`ALTER TABLE … VALIDATE CONSTRAINT …` for each one to make them authoritative
for pre-existing data too.

Verify afterwards:

```sql
SELECT conname, convalidated FROM pg_constraint
WHERE conrelid IN ('public.site_settings'::regclass, 'public.videos'::regclass)
  AND conname LIKE 'site_settings_%';
SELECT tgname FROM pg_trigger WHERE tgrelid = 'storage.objects'::regclass;
SELECT * FROM public.security_audit ORDER BY occurred_at DESC LIMIT 20;
```

## Incidents

### A third-party ad tag breaks the page

1. Set `ARINX_CSP_REPORT_ONLY=1` to downgrade enforcement to the baseline and
   restore service.
2. Inspect `/csp-report` structured logs (only hosts and directive names are
   recorded — no PII).
3. Fix the tag or remove it from Site Settings, then clear the flag and
   redeploy. Verify the nonce is back in the enforced CSP.

### Traffic flood

1. Confirm `ratelimit-*` and `retry-after` headers on `429` responses.
2. If the flood is distributed across isolates, bind
   `ARINX_RATE_LIMITER` (native Cloudflare Rate Limiting) — no deploy-time code
   change is needed, `registerRateLimitBackend()` picks it up automatically.
3. `/healthz` and `/readyz` are deliberately excluded from the document budget
   so load balancers never trip our own limiter.

### RUM / CWV regression

The `/rum` endpoint emits `{"event":"rum","metric":"LCP","value":…,"path":…}`
lines. Filter by metric and path; values are rounded integers (CLS is scaled by
1000). Investigate LCP > 2500 ms, INP > 200 ms and CLS > 100.

### Migration failure

Both migrations are additive and use `IF NOT EXISTS` / `DROP CONSTRAINT IF
EXISTS`. If a constraint add fails because a column is missing, confirm the
earlier migrations (especially `0006` and `0007`) were applied first.

## Observability gaps (to be closed with owner credentials)

- Claim Google Search Console, set `VITE_GOOGLE_SITE_VERIFICATION`, submit
  `/sitemap.xml` and monitor coverage / Core Web Vitals.
- Export the structured `request`, `csp-report` and `rum` log lines from the
  worker to a log sink with retention and alerting.
- Add uptime alerting on `/healthz` and a 5xx-rate alert from the `request`
  log lines.
