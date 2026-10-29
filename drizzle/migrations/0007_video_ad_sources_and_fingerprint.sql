ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS preroll_vast_url text NOT NULL DEFAULT '';
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS watermark_fingerprint text;
COMMENT ON COLUMN public.videos.watermark_fingerprint IS 'Upload fingerprint embedded in MP4 metadata; metadata can be removed and is not DRM.';