DROP POLICY IF EXISTS "Published media readable" ON storage.objects;
DROP POLICY IF EXISTS "Media readable when published or owned" ON storage.objects;
DROP POLICY IF EXISTS "Media public read" ON storage.objects;
CREATE POLICY "Owners read own media" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id IN ('videos', 'thumbnails', 'channel-art')
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);