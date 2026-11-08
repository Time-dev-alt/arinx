REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (name, handle, bio, location, avatar_url, banner_url, website_url, x_url, discord_url, instagram_url, watermark_mode, watermark_text, watermark_image_path) ON public.profiles TO authenticated;

REVOKE UPDATE ON public.videos FROM authenticated;
GRANT UPDATE (title, description, category, tags, visibility, is_short, thumbnail_url) ON public.videos TO authenticated;