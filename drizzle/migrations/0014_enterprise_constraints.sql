-- Enterprise-grade server-side validation and audit.
--
-- Everything below is enforced by PostgreSQL, so it cannot be bypassed by a
-- modified browser client, a direct PostgREST call or a forged Content-Type.
-- All CHECK constraints are added NOT VALID so historical rows are preserved;
-- new inserts/updates are validated immediately.
--
-- Review and apply in the Supabase SQL editor (or `supabase db push`) before
-- relying on it in production. Nothing in this file changes read policies.

-- ---------------------------------------------------------------------------
-- 1. Owner-editable settings: allowlists, HTTPS-only URLs, bounded values
-- ---------------------------------------------------------------------------
ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS site_settings_https_urls;
ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS site_settings_enum_values;
ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS site_settings_bounds;

ALTER TABLE public.site_settings
  ADD CONSTRAINT site_settings_https_urls CHECK (
    (preroll_vast_url = ''  OR preroll_vast_url  ~* '^https://[^[:space:]]+$') AND
    (preroll_video_url = '' OR preroll_video_url ~* '^https://[^[:space:]]+$') AND
    (preroll_click_url = '' OR preroll_click_url ~* '^https://[^[:space:]]+$')
  ) NOT VALID,
  ADD CONSTRAINT site_settings_enum_values CHECK (
    watermark_position IN ('top-left','top-right','bottom-left','bottom-right') AND
    compression_preset IN ('ultra','balanced','quality')
  ) NOT VALID,
  ADD CONSTRAINT site_settings_bounds CHECK (
    preroll_skip_seconds BETWEEN 0 AND 30 AND
    char_length(watermark_text) <= 120 AND
    char_length(adsterra_sidebar) <= 20000 AND
    char_length(adsterra_feed) <= 20000 AND
    char_length(adsterra_native) <= 20000 AND
    char_length(cf_customer_code) <= 128
  ) NOT VALID;

-- ---------------------------------------------------------------------------
-- 2. Storage objects: authoritative MIME / size / path validation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.arinx_validate_storage_object()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_mime text;
  v_size bigint;
  v_ext text;
BEGIN
  IF NEW.bucket_id NOT IN ('videos','thumbnails','channel-art') THEN
    RETURN NEW;
  END IF;

  -- Object names must be "<owner uuid>/<uuid>.<allowed extension>". This also
  -- blocks path traversal, null bytes and control characters.
  IF NEW.name !~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.[A-Za-z0-9]{1,8}$' THEN
    RAISE EXCEPTION 'Invalid storage object name';
  END IF;
  IF NEW.name ~ '\.\.|[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Unsafe storage object name';
  END IF;

  v_ext := lower(substring(NEW.name from '\.([A-Za-z0-9]{1,8})$'));
  v_mime := lower(coalesce(NEW.metadata->>'mimetype', ''));
  v_size := coalesce(nullif(NEW.metadata->>'size', '')::bigint, 0);

  IF NEW.bucket_id = 'videos' THEN
    IF v_ext NOT IN ('mp4','webm','mov','m4v') THEN
      RAISE EXCEPTION 'Unsupported video extension';
    END IF;
    IF v_mime NOT IN ('video/mp4','video/webm','video/quicktime','video/x-m4v','') THEN
      RAISE EXCEPTION 'Unsupported video MIME type';
    END IF;
    IF v_size > 2147483648 THEN
      RAISE EXCEPTION 'Video exceeds the 2 GB limit';
    END IF;
  ELSE
    IF v_ext NOT IN ('jpg','jpeg','png','webp') THEN
      RAISE EXCEPTION 'Unsupported image extension';
    END IF;
    IF v_mime NOT IN ('image/jpeg','image/png','image/webp','') THEN
      RAISE EXCEPTION 'Unsupported image MIME type';
    END IF;
    IF v_size > 12582912 THEN
      RAISE EXCEPTION 'Image exceeds the 12 MB limit';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS arinx_validate_storage_object ON storage.objects;
CREATE TRIGGER arinx_validate_storage_object
  BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.arinx_validate_storage_object();

-- ---------------------------------------------------------------------------
-- 3. Video metadata bounds and creator-scoped paths
-- ---------------------------------------------------------------------------
ALTER TABLE public.videos DROP CONSTRAINT IF EXISTS videos_metadata_bounds;
ALTER TABLE public.videos
  ADD CONSTRAINT videos_metadata_bounds CHECK (
    char_length(btrim(title)) BETWEEN 1 AND 200 AND
    char_length(description) <= 20000 AND
    duration BETWEEN 0 AND 86400 AND
    video_path ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.[A-Za-z0-9]{1,8}$'
  ) NOT VALID;

-- ---------------------------------------------------------------------------
-- 4. Immutable admin audit trail (who changed settings, never the values)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor uuid,
  action text NOT NULL,
  target text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_audit ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.security_audit TO service_role;
CREATE INDEX IF NOT EXISTS security_audit_occurred_idx
  ON public.security_audit (occurred_at DESC);

CREATE OR REPLACE FUNCTION public.arinx_audit_settings_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.security_audit (actor, action, target)
  VALUES (auth.uid(), TG_OP, TG_TABLE_NAME);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS arinx_audit_settings_change ON public.site_settings;
CREATE TRIGGER arinx_audit_settings_change
  AFTER INSERT OR UPDATE OR DELETE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.arinx_audit_settings_change();
