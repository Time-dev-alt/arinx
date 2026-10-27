ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS stream_uid text;
ALTER TABLE public.videos ALTER COLUMN video_path SET DEFAULT '';