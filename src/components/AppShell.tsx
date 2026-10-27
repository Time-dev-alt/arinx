import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Clock, Flame, History, Home, Library, Menu, Moon, PlaySquare, Search, Sun, ThumbsUp,
  Video as VideoIcon, X, Zap, Users, LayoutDashboard, Plus, LogOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { channelsByIdsQuery, publicVideosQuery, useAuth, useMe, useUserData } from "@/lib/api";
import { setPrefs, usePrefs } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Avatar } from "./common";
import { useIsAdmin } from "@/lib/settings";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-1.5 font-display text-xl font-bold tracking-tight">
      <span className="grid h-7 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M8 5v14l11-7z" /></svg>
      </span>
      Arin<span className="text-primary">X</span>
    </Link>
  );
}

function SearchBox({ onDone }: { onDone?: () => void }) {
  const prefs = usePrefs();
  const { data: vids = [] } = useQuery(publicVideosQuery());
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return prefs.searches.slice(0, 8).map((x) => ({ text: x, recent: true }));
    const pool = new Set<string>();
    for (const v of vids) {
      if (v.title.toLowerCase().includes(t)) pool.add(v.title.toLowerCase());
      for (const tag of v.tags) if (tag.toLowerCase().includes(t)) pool.add(tag.toLowerCase());
      if (v.channel.name.toLowerCase().includes(t)) pool.add(v.channel.name.toLowerCase());
    }
    return [...pool].slice(0, 10).map((x) => ({ text: x, recent: false }));
  }, [q, vids, prefs.searches]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const go = (term: string) => {
    const t = term.trim();
    if (!t) return;
    setQ(t);
    setOpen(false);
    setPrefs((st) => ({ searches: [t, ...st.searches.filter((x) => x !== t)].slice(0, 20) }));
    nav({ to: "/results", search: { q: t } });
    onDone?.();
  };

  return (
    <div ref={ref} className="relative w-full max-w-xl">
      <form onSubmit={(e) => { e.preventDefault(); go(idx >= 0 ? suggestions[idx]?.text ?? q : q); }} className="flex">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setIdx(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setIdx((i) => Math.min(i + 1, suggestions.length - 1));
            if (e.key === "ArrowUp") setIdx((i) => Math.max(i - 1, -1));
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search"
          aria-label="Search"
          className="h-10 w-full rounded-l-full border border-input bg-background px-4 text-sm outline-none focus:border-primary"
        />
        <button aria-label="Search" className="grid h-10 w-16 place-items-center rounded-r-full border border-l-0 border-input bg-muted hover:bg-accent"><Search className="h-5 w-5" /></button>
      </form>
      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-16 top-11 z-50 overflow-hidden rounded-xl border border-border bg-popover py-2 shadow-xl">
          {suggestions.map((sg, i) => (
            <li key={sg.text}>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => go(sg.text)} className={cn("flex w-full items-center gap-3 px-4 py-1.5 text-left text-sm font-medium hover:bg-accent", i === idx && "bg-accent")}>
                {sg.recent ? <History className="h-4 w-4 text-muted-foreground" /> : <Search className="h-4 w-4 text-muted-foreground" />}
                {sg.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type NavItem = { to: string; label: string; icon: typeof Home };
const MAIN: NavItem[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/shorts", label: "Shorts", icon: Zap },
  { to: "/subscriptions", label: "Subscriptions", icon: Users },
  { to: "/trending", label: "Trending", icon: Flame },
];
const YOU: NavItem[] = [
  { to: "/library", label: "Library", icon: Library },
  { to: "/history", label: "History", icon: History },
  { to: "/studio", label: "Your videos", icon: PlaySquare },
];

function SideLink({ item, mini, active }: { item: NavItem; mini: boolean; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link to={item.to} className={cn("flex items-center rounded-xl hover:bg-accent", mini ? "flex-col gap-1 px-1 py-4 text-[10px]" : "gap-5 px-3 py-2 text-sm", active && "bg-accent font-semibold")}>
      <Icon className="h-5 w-5 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function Sidebar({ mini, path }: { mini: boolean; path: string }) {
  const { uid } = useAuth();
  const u = useUserData();
  const { data: subs = [] } = useQuery({ ...channelsByIdsQuery(u.subscriptions), enabled: !!uid });
  const isActive = (to: string) => (to === "/" ? path === "/" : path.startsWith(to));
  if (mini)
    return (
      <nav className="flex flex-col p-1">
        {[...MAIN, YOU[0]!].map((i) => <SideLink key={i.to} item={i} mini active={isActive(i.to)} />)}
      </nav>
    );
  return (
    <nav className="flex flex-col gap-1 p-3 text-sm">
      {MAIN.map((i) => <SideLink key={i.to} item={i} mini={false} active={isActive(i.to)} />)}
      <hr className="my-2 border-border" />
      <p className="px-3 py-1 font-semibold">You</p>
      {YOU.map((i) => <SideLink key={i.to} item={i} mini={false} active={isActive(i.to)} />)}
      <Link to="/playlist/$id" params={{ id: "WL" }} className={cn("flex items-center gap-5 rounded-xl px-3 py-2 hover:bg-accent", path === "/playlist/WL" && "bg-accent font-semibold")}><Clock className="h-5 w-5" /> Watch later</Link>
      <Link to="/playlist/$id" params={{ id: "LL" }} className={cn("flex items-center gap-5 rounded-xl px-3 py-2 hover:bg-accent", path === "/playlist/LL" && "bg-accent font-semibold")}><ThumbsUp className="h-5 w-5" /> Liked videos</Link>
      <hr className="my-2 border-border" />
      <p className="px-3 py-1 font-semibold">Subscriptions</p>
      {!uid && <p className="px-3 text-xs text-muted-foreground">Sign in to subscribe to channels.</p>}
      {uid && subs.length === 0 && <p className="px-3 text-xs text-muted-foreground">Subscribe to channels to see them here.</p>}
      {subs.map((c) => (
        <Link key={c.id} to="/channel/$handle" params={{ handle: c.handle }} className="flex items-center gap-4 rounded-xl px-3 py-1.5 hover:bg-accent">
          <Avatar ch={c} className="h-6 w-6 text-[10px]" />
          <span className="truncate">{c.name}</span>
        </Link>
      ))}
      <hr className="my-2 border-border" />
      <p className="px-3 py-1 font-semibold">Studio</p>
      <SideLink item={{ to: "/studio/upload", label: "Upload video", icon: VideoIcon }} mini={false} active={path === "/studio/upload"} />
      <SideLink item={{ to: "/studio/customize", label: "Customize channel", icon: LayoutDashboard }} mini={false} active={path === "/studio/customize"} />
      <p className="px-3 pt-4 text-xs text-muted-foreground">ArinX · open-source video platform</p>
    </nav>
  );
}

function AccountButton() {
  const { uid, ready } = useAuth();
  const { data: me } = useMe();
  const { data: isAdmin } = useIsAdmin();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  if (!ready) return <span className="ml-1 h-8 w-8" />;
  if (!uid)
    return <Link to="/auth" className="ml-1 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10">Sign in</Link>;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Account menu"><Avatar ch={me} className="ml-1 h-8 w-8 text-sm" /></button>
      {open && me && (
        <div className="absolute right-0 top-10 z-50 w-56 rounded-xl border border-border bg-popover py-2 shadow-xl" onMouseLeave={() => setOpen(false)}>
          <div className="px-4 pb-2"><p className="font-semibold">{me.name}</p><p className="text-sm text-muted-foreground">@{me.handle}</p></div>
          <Link to="/channel/$handle" params={{ handle: me.handle }} onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-accent">Your channel</Link>
          <Link to="/studio" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-accent">ArinX Studio</Link>
          {isAdmin && <Link to="/admin" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm font-medium text-primary hover:bg-accent">Owner admin panel</Link>}
          <button onClick={async () => { setOpen(false); await supabase.auth.signOut(); nav({ to: "/" }); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-accent"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const prefs = usePrefs();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const overlayMode = path.startsWith("/watch") || path.startsWith("/shorts");
  const bare = path.startsWith("/auth");
  const [expanded, setExpanded] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);

  useEffect(() => { document.documentElement.classList.toggle("dark", prefs.theme === "dark"); }, [prefs.theme]);
  useEffect(() => setDrawer(false), [path]);

  if (bare) return <>{children}</>;

  const toggle = () => {
    if (overlayMode || window.innerWidth < 1024) setDrawer((d) => !d);
    else setExpanded((e) => !e);
  };
  const showRail = !overlayMode;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between gap-4 bg-background/95 px-4 backdrop-blur">
        {mobileSearch ? (
          <div className="flex w-full items-center gap-2 md:hidden">
            <button onClick={() => setMobileSearch(false)} aria-label="Close search" className="rounded-full p-2 hover:bg-accent"><X className="h-5 w-5" /></button>
            <SearchBox onDone={() => setMobileSearch(false)} />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <button onClick={toggle} aria-label="Menu" className="rounded-full p-2 hover:bg-accent"><Menu className="h-5 w-5" /></button>
              <Logo />
            </div>
            <div className="hidden flex-1 justify-center md:flex"><SearchBox /></div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMobileSearch(true)} aria-label="Search" className="rounded-full p-2 hover:bg-accent md:hidden"><Search className="h-5 w-5" /></button>
              <Link to="/studio/upload" className="hidden items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-medium hover:bg-accent sm:flex"><Plus className="h-5 w-5" /> Create</Link>
              <button aria-label="Toggle theme" onClick={() => setPrefs((st) => ({ theme: st.theme === "dark" ? "light" : "dark" }))} className="rounded-full p-2 hover:bg-accent">
                {prefs.theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <AccountButton />
            </div>
          </>
        )}
      </header>

      {showRail && (
        <aside className={cn("fixed bottom-0 left-0 top-14 z-30 hidden overflow-y-auto lg:block", expanded ? "w-60" : "w-[72px]")}>
          <Sidebar mini={!expanded} path={path} />
        </aside>
      )}
      {showRail && (
        <aside className="fixed bottom-0 left-0 top-14 z-30 hidden w-[72px] overflow-y-auto md:block lg:hidden">
          <Sidebar mini path={path} />
        </aside>
      )}

      {drawer && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setDrawer(false)} />
          <aside className="absolute bottom-0 left-0 top-0 w-64 overflow-y-auto bg-background shadow-2xl">
            <div className="flex h-14 items-center gap-3 px-4">
              <button onClick={() => setDrawer(false)} aria-label="Close menu" className="rounded-full p-2 hover:bg-accent"><Menu className="h-5 w-5" /></button>
              <Logo />
            </div>
            <Sidebar mini={false} path={path} />
          </aside>
        </div>
      )}

      <main className={cn("pt-14", showRail && (expanded ? "md:pl-[72px] lg:pl-60" : "md:pl-[72px]"))}>{children}</main>
    </div>
  );
}
