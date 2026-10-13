import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, ThumbsUp, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { commentsQuery, useAuth, useMe, useRequireAuth, useUserData, type Comment } from "@/lib/api";
import { ago, compact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar } from "./common";

function Composer({ onSubmit, placeholder, small, onCancel, autoFocus }: { onSubmit: (t: string) => Promise<void>; placeholder: string; small?: boolean; onCancel?: () => void; autoFocus?: boolean }) {
  const { data: me } = useMe();
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(!!autoFocus);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex gap-3">
      <Avatar ch={me} className={small ? "h-6 w-6 text-[10px]" : "h-10 w-10"} />
      <div className="flex-1">
        <input autoFocus={autoFocus} value={text} onFocus={() => setFocus(true)} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={5000}
          className="w-full border-b border-border bg-transparent py-1 text-sm outline-none focus:border-foreground" />
        {focus && (
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => { setText(""); setFocus(false); onCancel?.(); }} className="rounded-full px-4 py-1.5 text-sm font-medium hover:bg-accent">Cancel</button>
            <button disabled={!text.trim() || busy} onClick={async () => { setBusy(true); await onSubmit(text.trim()); setBusy(false); setText(""); setFocus(false); }}
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40">
              {small ? "Reply" : "Comment"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentItem({ c, replies, onReply, refresh }: { c: Comment; replies?: Comment[]; onReply: (parent: string, text: string) => Promise<void>; refresh: () => void }) {
  const u = useUserData();
  const { uid } = useAuth();
  const req = useRequireAuth();
  const [replying, setReplying] = useState(false);
  const [open, setOpen] = useState(false);
  const liked = u.likedComments.includes(c.id);
  return (
    <div className="flex gap-3">
      <Avatar ch={c.author} className={c.parentId ? "h-6 w-6 text-[10px]" : "h-10 w-10"} />
      <div className="min-w-0 flex-1">
        <p className="text-xs"><span className="font-semibold">@{c.author.handle}</span> <span className="text-muted-foreground">{ago(c.createdAt)}</span></p>
        <p className="mt-1 whitespace-pre-wrap text-sm">{c.text}</p>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <button aria-label="Like comment" className="rounded-full p-1.5 hover:bg-accent"
            onClick={() => req("like comments", async (id) => {
              if (liked) await supabase.from("comment_likes").delete().eq("user_id", id).eq("comment_id", c.id);
              else await supabase.from("comment_likes").insert({ user_id: id, comment_id: c.id });
              refresh();
            })}>
            <ThumbsUp className={cn("h-4 w-4", liked && "fill-current text-foreground")} />
          </button>
          <span>{c.likes > 0 ? compact(c.likes) : ""}</span>
          <button onClick={() => req("reply", () => setReplying(true))} className="rounded-full px-3 py-1 font-medium text-foreground hover:bg-accent">Reply</button>
          {uid === c.userId && (
            <button aria-label="Delete comment" onClick={async () => { await supabase.from("comments").delete().eq("id", c.id); refresh(); }} className="rounded-full p-1.5 hover:bg-accent"><Trash2 className="h-4 w-4" /></button>
          )}
        </div>
        {replying && (
          <div className="mt-2">
            <Composer small autoFocus placeholder="Add a reply…" onCancel={() => setReplying(false)} onSubmit={async (t) => { await onReply(c.parentId ?? c.id, t); setReplying(false); setOpen(true); }} />
          </div>
        )}
        {replies && replies.length > 0 && (
          <>
            <button onClick={() => setOpen((o) => !o)} className="mt-1 flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/10">
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </button>
            {open && <div className="mt-2 space-y-4">{replies.map((r) => <CommentItem key={r.id} c={r} onReply={onReply} refresh={refresh} />)}</div>}
          </>
        )}
      </div>
    </div>
  );
}

export function Comments({ videoId }: { videoId: string }) {
  const { uid } = useAuth();
  const qc = useQueryClient();
  const [sort, setSort] = useState<"top" | "new">("top");
  const { data: all = [] } = useQuery(commentsQuery(videoId));
  const refresh = () => { qc.invalidateQueries({ queryKey: ["comments", videoId] }); qc.invalidateQueries({ queryKey: ["me"] }); };
  const tops = all.filter((c) => !c.parentId).sort((a, b) => (sort === "top" ? b.likes - a.likes || +new Date(b.createdAt) - +new Date(a.createdAt) : +new Date(b.createdAt) - +new Date(a.createdAt)));
  const repliesOf = (id: string) => all.filter((c) => c.parentId === id).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));

  const add = async (text: string, parentId?: string) => {
    if (!uid) return;
    const { error } = await supabase.from("comments").insert({ video_id: videoId, user_id: uid, parent_id: parentId ?? null, body: text });
    if (error) toast.error("Couldn't post comment");
    refresh();
  };

  return (
    <section className="mt-6">
      <div className="mb-6 flex items-center gap-8">
        <h2 className="text-xl font-bold">{all.length} Comments</h2>
        <button onClick={() => setSort((x) => (x === "top" ? "new" : "top"))} className="flex items-center gap-2 text-sm font-medium">
          <ArrowUpDown className="h-5 w-5" /> {sort === "top" ? "Top comments" : "Newest first"}
        </button>
      </div>
      {uid ? <Composer placeholder="Add a comment…" onSubmit={async (t) => { await add(t); setSort("new"); }} /> : <p className="text-sm text-muted-foreground"><a href="/auth" className="font-medium text-primary">Sign in</a> to join the conversation.</p>}
      <div className="mt-6 space-y-6">
        {tops.map((c) => <CommentItem key={c.id} c={c} replies={repliesOf(c.id)} onReply={(p, t) => add(t, p)} refresh={refresh} />)}
        {all.length === 0 && <p className="text-sm text-muted-foreground">No comments yet. Be the first!</p>}
      </div>
    </section>
  );
}
