-- Fix the flagged public file-read policy while preserving published media access.
-- The previous policy relied on implicit RLS evaluation inside a SECURITY
-- INVOKER subquery, which made it possible for a private upload to become
-- readable as soon as its path was known. State the intent explicitly.

DROP POLICY IF EXISTS "Media readable when published or owned" ON storage.objects;
CREATE POLICY "Published media readable" ON storage.objects
FOR SELECT TO anon, authenticated
USING (
  bucket_id IN ('videos', 'thumbnails', 'channel-art')
  AND (
    -- Creators can always reach files inside their own folder.
    (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = auth.uid()::text)
    OR (
      bucket_id = 'videos' AND EXISTS (
        SELECT 1 FROM public.videos v
        WHERE v.video_path = storage.objects.name
          AND v.visibility IN ('public', 'unlisted')
      )
    )
    OR (
      bucket_id = 'thumbnails' AND EXISTS (
        SELECT 1 FROM public.videos v
        WHERE v.thumbnail_url = storage.objects.name
          AND v.visibility IN ('public', 'unlisted')
      )
    )
    OR (
      bucket_id = 'channel-art' AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.avatar_url = storage.objects.name
           OR p.banner_url = storage.objects.name
      )
    )
  )
);

-- Comments must only be exposed for published videos, not private uploads.
DROP POLICY IF EXISTS "Comments visible on viewable videos" ON public.comments;
CREATE POLICY "Comments visible on published videos" ON public.comments
FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.videos v
    WHERE v.id = comments.video_id
      AND v.visibility IN ('public', 'unlisted')
  )
);

-- Speeds up the public feed, sitemap and SSR catalog reads.
CREATE INDEX IF NOT EXISTS videos_public_created_idx
  ON public.videos (created_at DESC)
  WHERE visibility = 'public';
