import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { SignInPrompt, Loading } from "@/components/common";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/api";
import { compact, pageHead } from "@/lib/format";
import { useIsAdmin, useSiteSettings, type SiteSettings } from "@/lib/settings";
import { validateSiteSettings } from "@/lib/settings-validation";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () =>
    pageHead("Owner admin", "Manage ads, video protection, compression and content on ArinX.", {
      noindex: true,
    }),
  component: AdminPage,
});

const TABS = ["Monetization", "Watermark", "Compression", "Content"] as const;

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 text-sm">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => set(!on)}
        aria-pressed={on}
        className={cn("relative h-6 w-11 rounded-full transition", on ? "bg-primary" : "bg-muted")}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-background transition",
            on ? "left-5" : "left-0.5",
          )}
        />
      </button>
    </label>
  );
}
const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function AdminPage() {
  const { uid, ready } = useAuth();
  const { data: isAdmin, isLoading } = useIsAdmin();
  const { data: settings } = useSiteSettings();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Monetization");
  const [s, setS] = useState<SiteSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  useEffect(() => {
    if (settings) setS(settings);
  }, [settings]);

  if (!ready || (uid && isLoading)) return <Loading />;
  if (!uid)
    return (
      <SignInPrompt title="Owner admin panel" text="Sign in with the owner account to continue." />
    );
  if (!isAdmin)
    return (
      <p className="p-10 text-center text-muted-foreground">
        This page is only available to the site owner.
      </p>
    );
  if (!s) return <Loading />;

  const up = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => setS({ ...s, [k]: v });
  const save = async () => {
    const { id: _id, updated_at: _u, ...rest } = s;
    // Validate *before* writing: the publishable-key client has no server-side
    // constraints, so this is the only place dangerous stored values can be
    // rejected. Render-time sanitizers remain the second line of defence.
    const { value, errors, cleaned } = validateSiteSettings(rest);
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("site_settings")
      .update({ ...value, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setSaving(false);
    if (error) return toast.error(error.message);
    if (cleaned) setS({ ...s, ...value });
    toast.success(cleaned ? "Settings saved (some values were cleaned)" : "Settings saved");
    qc.invalidateQueries({ queryKey: ["site_settings"] });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Owner admin panel</h1>
          <p className="text-sm text-muted-foreground">
            Control ads, protection and uploads across ArinX.
          </p>
        </div>
        {tab !== "Content" && (
          <button
            onClick={save}
            disabled={saving}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium",
              tab === t ? "bg-foreground text-background" : "bg-secondary hover:bg-accent",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Monetization" && (
        <>
          <Section
            title="Adsterra banners"
            hint="Paste the full code snippet Adsterra gives you for each ad unit."
          >
            <Toggle
              label="Show ads on the site"
              on={s.ads_enabled}
              set={(v) => up("ads_enabled", v)}
            />
            {(
              [
                ["adsterra_sidebar", "Watch page sidebar (300×250)"],
                ["adsterra_feed", "Home feed banner (728×90)"],
                ["adsterra_native", "Native banner under videos"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="block space-y-1 text-sm">
                <span className="font-medium">{l}</span>
                <textarea
                  rows={3}
                  className={cn(input, "font-mono text-xs")}
                  value={s[k]}
                  onChange={(e) => up(k, e.target.value)}
                  placeholder="<script ...></script>"
                />
              </label>
            ))}
          </Section>
          <Section
            title="Video ads before videos"
            hint="A skippable video ad shown before playback. Paste a VAST tag from any ad network, or a direct sponsor video link — VAST takes priority when both are set."
          >
            <Toggle
              label="Enable pre-roll ads"
              on={s.preroll_enabled}
              set={(v) => up("preroll_enabled", v)}
            />
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Ad network tag (VAST)</span>
              <input
                className={cn(input, "font-mono text-xs")}
                placeholder="https://…vast-tag.xml from your ad provider"
                value={s.preroll_vast_url}
                onChange={(e) => up("preroll_vast_url", e.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Direct sponsor video (fallback)</span>
              <input
                className={input}
                placeholder="Ad video link (.mp4 or .m3u8)"
                value={s.preroll_video_url}
                onChange={(e) => up("preroll_video_url", e.target.value)}
              />
            </label>
            <input
              className={input}
              placeholder="Where clicking the ad goes (https://…)"
              value={s.preroll_click_url}
              onChange={(e) => up("preroll_click_url", e.target.value)}
            />
            <label className="flex items-center justify-between text-sm">
              Seconds before “Skip” appears
              <input
                type="number"
                min={0}
                max={30}
                className={cn(input, "w-24")}
                value={s.preroll_skip_seconds}
                onChange={(e) => up("preroll_skip_seconds", Number(e.target.value))}
              />
            </label>
          </Section>
        </>
      )}

      {tab === "Watermark" && (
        <Section
          title="Permanent watermarks"
          hint="Burned into every frame during upload — they survive downloads, re-uploads and screen recordings, making copyright claims actionable."
        >
          <p className="rounded-lg bg-muted p-3 text-sm">
            Watermarks are always on. Creators choose their own text or logo in Customize channel;
            this text is used only as a fallback.
          </p>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Fallback watermark text</span>
            <input
              className={input}
              maxLength={40}
              value={s.watermark_text}
              onChange={(e) => up("watermark_text", e.target.value)}
              placeholder="ArinX"
            />
          </label>
          <div className="space-y-1 text-sm">
            <span className="font-medium">Position</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => up("watermark_position", p)}
                  className={cn(
                    "rounded-lg border px-2 py-1.5 capitalize",
                    s.watermark_position === p ? "border-primary bg-primary/10" : "border-border",
                  )}
                >
                  {p.replace("-", " ")}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Every upload also gets an invisible layer (a faint repeating fingerprint across the
            whole frame) plus the fingerprint in the file details, so copies can be traced back to
            the channel.
          </p>
        </Section>
      )}

      {tab === "Compression" && (
        <Section
          title="Shrink videos before upload"
          hint="Videos are compressed in the creator's browser before uploading, saving storage and bandwidth."
        >
          <Toggle
            label="Compress uploads automatically"
            on={s.compression_enabled}
            set={(v) => up("compression_enabled", v)}
          />
          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ["ultra", "Ultra small", "720p · up to ~80% smaller"],
                ["balanced", "Balanced HD", "1080p · ~60% smaller"],
                ["quality", "High quality", "1080p · ~35% smaller"],
              ] as const
            ).map(([k, l, d]) => (
              <button
                key={k}
                onClick={() => up("compression_preset", k)}
                className={cn(
                  "rounded-xl border p-3 text-left",
                  s.compression_preset === k ? "border-primary bg-primary/10" : "border-border",
                )}
              >
                <p className="font-semibold">{l}</p>
                <p className="text-xs text-muted-foreground">{d}</p>
              </button>
            ))}
          </div>
        </Section>
      )}

      {tab === "Content" && <ContentTab />}
    </div>
  );
}

function ContentTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin_videos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("id,title,visibility,views,created_at,profiles(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
  const act = async (id: string, change: "public" | "unlisted" | "private" | "delete") => {
    if (change === "delete" && !confirm("Delete this video permanently?")) return;
    const { error } =
      change === "delete"
        ? await supabase.from("videos").delete().eq("id", id)
        : await supabase.from("videos").update({ visibility: change }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    qc.invalidateQueries();
  };
  if (isLoading) return <Loading />;
  const total = (data ?? []).reduce((a, v) => a + Number(v.views), 0);
  return (
    <Section
      title="All videos"
      hint={`${data?.length ?? 0} videos · ${compact(total)} total views`}
    >
      <div className="divide-y divide-border">
        {(data ?? []).map((v) => (
          <div key={v.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{v.title}</p>
              <p className="text-xs text-muted-foreground">
                {(v.profiles as { name: string } | null)?.name} · {compact(Number(v.views))} views
              </p>
            </div>
            <select
              value={v.visibility}
              onChange={(e) => act(v.id, e.target.value as "public")}
              className="rounded-lg border border-border bg-background px-2 py-1"
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
            <button
              onClick={() => act(v.id, "delete")}
              aria-label="Delete"
              className="rounded-full p-2 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {!data?.length && <p className="py-6 text-center text-muted-foreground">No videos yet.</p>}
      </div>
    </Section>
  );
}
