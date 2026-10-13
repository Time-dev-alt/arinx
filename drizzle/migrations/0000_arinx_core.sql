CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'New channel',
  handle text NOT NULL UNIQUE,
  bio text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  avatar_url text,
  banner_url text,
  subscriber_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are public" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Other',
  tags text[] NOT NULL DEFAULT '{}',
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','unlisted','private')),
  is_short boolean NOT NULL DEFAULT false,
  video_url text NOT NULL,
  video_path text NOT NULL,
  thumbnail_url text,
  duration integer NOT NULL DEFAULT 0,
  views bigint NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX videos_owner_idx ON public.videos(owner_id);
CREATE INDEX videos_created_idx ON public.videos(created_at DESC);
GRANT SELECT ON public.videos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public and unlisted videos are viewable" ON public.videos FOR SELECT USING (visibility <> 'private' OR auth.uid() = owner_id);
CREATE POLICY "Owners insert videos" ON public.videos FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update videos" ON public.videos FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete videos" ON public.videos FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE TABLE public.video_reactions (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value IN (1,-1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_reactions TO authenticated;
GRANT ALL ON public.video_reactions TO service_role;
ALTER TABLE public.video_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own reactions" ON public.video_reactions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  likes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_video_idx ON public.comments(video_id);
GRANT SELECT ON public.comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments are public" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Users add comments" ON public.comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own comments" ON public.comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.comment_likes (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, comment_id)
);
GRANT SELECT, INSERT, DELETE ON public.comment_likes TO authenticated;
GRANT ALL ON public.comment_likes TO service_role;
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own comment likes" ON public.comment_likes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.subscriptions (
  subscriber_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscriber_id, channel_id),
  CHECK (subscriber_id <> channel_id)
);
GRANT SELECT, INSERT, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own subscriptions" ON public.subscriptions FOR ALL TO authenticated USING (auth.uid() = subscriber_id) WITH CHECK (auth.uid() = subscriber_id);

CREATE TABLE public.playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlists TO authenticated;
GRANT ALL ON public.playlists TO service_role;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own playlists" ON public.playlists FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.playlist_items (
  playlist_id uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, video_id)
);
GRANT SELECT, INSERT, DELETE ON public.playlist_items TO authenticated;
GRANT ALL ON public.playlist_items TO service_role;
ALTER TABLE public.playlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own playlist items" ON public.playlist_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND p.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND p.owner_id = auth.uid()));

CREATE TABLE public.watch_later (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);
GRANT SELECT, INSERT, DELETE ON public.watch_later TO authenticated;
GRANT ALL ON public.watch_later TO service_role;
ALTER TABLE public.watch_later ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own watch later" ON public.watch_later FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.watch_history (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  watched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watch_history TO authenticated;
GRANT ALL ON public.watch_history TO service_role;
ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own history" ON public.watch_history FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Counters
CREATE OR REPLACE FUNCTION public.sync_video_likes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE vid uuid := COALESCE(NEW.video_id, OLD.video_id);
BEGIN
  UPDATE public.videos SET likes = (SELECT count(*) FROM public.video_reactions WHERE video_id = vid AND value = 1) WHERE id = vid;
  RETURN NULL;
END $$;
CREATE TRIGGER video_reactions_count AFTER INSERT OR UPDATE OR DELETE ON public.video_reactions FOR EACH ROW EXECUTE FUNCTION public.sync_video_likes();

CREATE OR REPLACE FUNCTION public.sync_comment_likes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid := COALESCE(NEW.comment_id, OLD.comment_id);
BEGIN
  UPDATE public.comments SET likes = (SELECT count(*) FROM public.comment_likes WHERE comment_id = cid) WHERE id = cid;
  RETURN NULL;
END $$;
CREATE TRIGGER comment_likes_count AFTER INSERT OR DELETE ON public.comment_likes FOR EACH ROW EXECUTE FUNCTION public.sync_comment_likes();

CREATE OR REPLACE FUNCTION public.sync_subscribers() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ch uuid := COALESCE(NEW.channel_id, OLD.channel_id);
BEGIN
  UPDATE public.profiles SET subscriber_count = (SELECT count(*) FROM public.subscriptions WHERE channel_id = ch) WHERE id = ch;
  RETURN NULL;
END $$;
CREATE TRIGGER subscriptions_count AFTER INSERT OR DELETE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.sync_subscribers();

CREATE OR REPLACE FUNCTION public.record_view(_video_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.videos SET views = views + 1 WHERE id = _video_id AND (visibility <> 'private' OR owner_id = auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.record_view(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, handle, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'New channel'),
    'user' || substr(replace(NEW.id::text, '-', ''), 1, 10),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage policies: users write only inside their own folder
CREATE POLICY "Media public read" ON storage.objects FOR SELECT USING (bucket_id IN ('videos','thumbnails','channel-art'));
CREATE POLICY "Users upload own media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('videos','thumbnails','channel-art') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own media" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN ('videos','thumbnails','channel-art') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN ('videos','thumbnails','channel-art') AND (storage.foldername(name))[1] = auth.uid()::text);
