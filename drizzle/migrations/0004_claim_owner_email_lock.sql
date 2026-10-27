CREATE OR REPLACE FUNCTION public.claim_owner()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN true; END IF;
  IF lower(coalesce(auth.jwt() ->> 'email', '')) <> 'paradoxtime089@gmail.com' THEN RETURN false; END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (auth.uid(), 'admin') ON CONFLICT DO NOTHING;
  RETURN true;
END $$;