import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Logo } from "@/components/AppShell";
import { useAuth } from "@/lib/api";
import { pageHead } from "@/lib/format";

export const Route = createFileRoute("/auth")({
  head: () =>
    pageHead("Sign in", "Sign in or create your ArinX account to subscribe, comment and upload.", {
      noindex: true,
    }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const { uid } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (uid) nav({ to: "/" });
  }, [uid, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) toast.success("Check your email to confirm your account");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
  };

  const field =
    "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8">
        <Logo />
        <h1 className="mt-6 font-display text-2xl font-bold">
          {mode === "in" ? "Sign in" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">to continue to ArinX</p>
        <button
          onClick={google}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-accent"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4">
            <path
              fill="currentColor"
              d="M21.35 11.1H12v2.9h5.35c-.25 1.5-1.7 4.4-5.35 4.4-3.2 0-5.85-2.65-5.85-5.9S8.8 6.6 12 6.6c1.85 0 3.05.8 3.75 1.45l2.55-2.45C16.7 4.1 14.55 3.1 12 3.1 6.95 3.1 2.9 7.15 2.9 12.2s4.05 9.1 9.1 9.1c5.25 0 8.75-3.7 8.75-8.9 0-.6-.05-1.05-.15-1.3z"
            />
          </svg>
          Continue with Google
        </button>
        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <hr className="flex-1 border-border" />
          or
          <hr className="flex-1 border-border" />
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode === "up" && (
            <input
              className={field}
              placeholder="Channel name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            className={field}
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={field}
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            disabled={busy}
            className="w-full rounded-full bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button
          onClick={() => setMode(mode === "in" ? "up" : "in")}
          className="mt-4 w-full text-center text-sm text-primary"
        >
          {mode === "in" ? "New to ArinX? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
