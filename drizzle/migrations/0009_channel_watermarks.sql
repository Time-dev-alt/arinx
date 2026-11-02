ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS watermark_mode text NOT NULL DEFAULT 'text' CHECK (watermark_mode IN ('text','image'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS watermark_text text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS watermark_image_path text;