ALTER TABLE public.videos ALTER COLUMN video_url DROP NOT NULL;
COMMENT ON COLUMN public.videos.video_url IS 'DEPRECATED: media is private; use video_path with signed URLs';