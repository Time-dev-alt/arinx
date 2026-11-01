DROP POLICY IF EXISTS "Media public read" ON storage.objects;
CREATE POLICY "Media readable when published or owned" ON storage.objects FOR SELECT USING (
  bucket_id IN ('videos','thumbnails','channel-art') AND (
    (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = auth.uid()::text)
    OR (bucket_id = 'videos' AND EXISTS (SELECT 1 FROM public.videos v WHERE v.video_path = storage.objects.name))
    OR (bucket_id = 'thumbnails' AND EXISTS (SELECT 1 FROM public.videos v WHERE v.thumbnail_url = storage.objects.name))
    OR (bucket_id = 'channel-art' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.avatar_url = storage.objects.name OR p.banner_url = storage.objects.name))
  )
);

DROP POLICY IF EXISTS "Comments are public" ON public.comments;
CREATE POLICY "Comments visible on viewable videos" ON public.comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.videos v WHERE v.id = comments.video_id)
);

DROP POLICY IF EXISTS "Profiles are public" ON public.profiles;
CREATE POLICY "Channel profiles are viewable" ON public.profiles FOR SELECT USING (handle IS NOT NULL AND id IS NOT NULL);

DROP POLICY IF EXISTS "Settings readable" ON public.site_settings;
CREATE POLICY "Site settings singleton readable" ON public.site_settings FOR SELECT USING (id = 1);