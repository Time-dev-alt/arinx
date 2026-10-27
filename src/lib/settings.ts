import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/api";

export type SiteSettings = Database["public"]["Tables"]["site_settings"]["Row"];

export const siteSettingsQuery = queryOptions({
  queryKey: ["site_settings"],
  queryFn: async () => {
    const { data, error } = await supabase.from("site_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    return data as SiteSettings | null;
  },
  staleTime: 60_000,
});

export const useSiteSettings = () => useQuery(siteSettingsQuery);

/** Asks the database whether the signed-in user is the owner/admin (claims owner role for the owner email). */
export function useIsAdmin() {
  const { uid } = useAuth();
  return useQuery({
    queryKey: ["is_admin", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("claim_owner");
      if (error) throw error;
      return !!data;
    },
  });
}
