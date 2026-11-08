REVOKE INSERT ON public.profiles FROM authenticated;
REVOKE INSERT ON public.videos FROM authenticated;
GRANT INSERT (owner_id, title, description, category, tags, visibility, is_short, video_url, video_path, thumbnail_url, duration, stream_uid, watermark_fingerprint) ON public.videos TO authenticated;