ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS watermark_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS watermark_text text NOT NULL DEFAULT 'ArinX',
  ADD COLUMN IF NOT EXISTS watermark_position text NOT NULL DEFAULT 'bottom-right';

COMMENT ON COLUMN public.site_settings.cf_customer_code IS 'DEPRECATED: Cloudflare Stream integration dropped; downloads are allowed, protection is via baked-in watermarks.';
COMMENT ON COLUMN public.site_settings.cf_signed_urls IS 'DEPRECATED: Cloudflare Stream integration dropped; downloads are allowed, protection is via baked-in watermarks.';
COMMENT ON COLUMN public.videos.stream_uid IS 'DEPRECATED: Cloudflare Stream integration dropped; videos are served from storage with baked-in watermarks.';