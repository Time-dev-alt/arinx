CREATE OR REPLACE FUNCTION public.creator_monetization_status()
RETURNS TABLE(subscribers integer, eligible boolean, remaining integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT p.subscriber_count, p.subscriber_count >= 1000, greatest(0, 1000-p.subscriber_count) FROM public.profiles p WHERE p.id=(select auth.uid()) $$;
REVOKE ALL ON FUNCTION public.creator_monetization_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creator_monetization_status() TO authenticated;
COMMENT ON FUNCTION public.creator_monetization_status() IS 'Creator eligibility begins at 1000 subscribers; ads remain enabled for all channels. Eligibility alone does not implement payments.';