import { useMemo, useState } from "react";
import { ArrowUpDown, ThumbsDown, ThumbsUp, ChevronDown, ChevronUp } from "lucide-react";
import { ME_ID, seedComments, type Comment } from "@/lib/data";
import { ago, compact } from "@/lib/format";
import { getChannel, setState, toggleIn, uid, useAppState } from "@/lib/store";
import { cn } from "@/lib/utils";

function Composer({ onSubmit, placeholder, small, onCancel, autoFocus }: { onSubmit: (t: string) => void; placeholder: string; small?: boolean; onCancel?: () => void; autoFocus?: boolean }) {
  const s = useAppState();
  const me = getChannel(s, ME_ID)!;
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(!!autoFocus);
  return (
    <div className="flex gap-3">
      <img src={me.avatar} alt="" className={cn("rounded-full object-cover", small ? "h-6 w-6" : "h-10 w-10")} />
      <div className="flex-1">
        <input
          autoFocus={autoFocus}
          value={text}
          onFocus={() => setFocus(true)}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="w-full border-b border-border bg-transparent py-1 text-sm outline-none focus:border-foreground"
        />
        {focus && (
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => { setText(""); setFocus(false); onCancel?.(); }} className="rounded-full px-4 py-1.5 text-sm font-medium hover:bg-accent">Cancel</button>
            <button
              disabled={!text.trim()}
              onClick={() => { onSubmit(text.trim()); setText(""); setFocus(false); }}
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              {small ? "Reply" : "Comment"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentItem({ c, replies, onReply }: { c: Comment; replies?: Comment[]; onReply: (parent: string, text: string) => void }) {
  const s = useAppState();
  const [replying, setReplying] = useState(false);
  const [open, setOpen] = useState(false);
  const liked = s.likedComments.includes(c.id);
  return (
    <div className="flex gap-3">
      <img src={c.avatar} alt="" className={cn("rounded-full object-cover", c.parentId ? "h-6 w-6" : "h-10 w-10")} />
      <div className="min-w-0 flex-1">
        <p className="text-xs"><span className="font-semibold">@{c.author.toLowerCase().replace(/\s+/g, "")}</span> <span className="text-muted-foreground">{ago(c.createdAt)}</span></p>
        <p className="mt-1 whitespace-pre-wrap text-sm">{c.text}</p>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <button aria-label="Like comment" onClick={() => setState((st) => ({ likedComments: toggleIn(st.likedComments, c.id) }))} className="rounded-full p-1.5 hover:bg-accent">
            <ThumbsUp className={cn("h-4 w-4", liked && "fill-current text-foreground")} />
          </button>
          <span>{c.likes + (liked ? 1 : 0) > 0 ? compact(c.likes + (liked ? 1 : 0)) : ""}</span>
          <button aria-label="Dislike comment" className="rounded-full p-1.5 hover:bg-accent"><ThumbsDown className="h-4 w-4" /></button>
          <button onClick={() => setReplying(true)} className="rounded-full px-3 py-1 font-medium text-foreground hover:bg-accent">Reply</button>
        </div>
        {replying && (
          <div className="mt-2">
            <Composer small autoFocus placeholder="Add a reply…" onCancel={() => setReplying(false)} onSubmit={(t) => { onReply(c.parentId ?? c.id, t); setReplying(false); setOpen(true); }} />
          </div>
        )}
        {replies && replies.length > 0 && (
          <>
            <button onClick={() => setOpen((o) => !o)} className="mt-1 flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/10">
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </button>
            {open && (
              <div className="mt-2 space-y-4">
                {replies.map((r) => <CommentItem key={r.id} c={r} onReply={onReply} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function Comments({ videoId }: { videoId: string }) {
  const s = useAppState();
  const [sort, setSort] = useState<"top" | "new">("top");
  const me = getChannel(s, ME_ID)!;
  const all = useMemo(() => [...seedComments(videoId), ...s.comments.filter((c) => c.videoId === videoId)], [videoId, s.comments]);
  const tops = all
    .filter((c) => !c.parentId)
    .sort((a, b) => (sort === "top" ? b.likes - a.likes || +new Date(b.createdAt) - +new Date(a.createdAt) : +new Date(b.createdAt) - +new Date(a.createdAt)));
  const repliesOf = (id: string) => all.filter((c) => c.parentId === id).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));

  const add = (text: string, parentId?: string) =>
    setState((st) => ({
      comments: [...st.comments, { id: "uc" + uid(), videoId, parentId, author: me.name, avatar: me.avatar, text, likes: 0, createdAt: new Date().toISOString() }],
    }));

  return (
    <section className="mt-6">
      <div className="mb-6 flex items-center gap-8">
        <h2 className="text-xl font-bold">{all.length} Comments</h2>
        <button onClick={() => setSort((x) => (x === "top" ? "new" : "top"))} className="flex items-center gap-2 text-sm font-medium">
          <ArrowUpDown className="h-5 w-5" /> {sort === "top" ? "Top comments" : "Newest first"}
        </button>
      </div>
      <Composer placeholder="Add a comment…" onSubmit={(t) => { add(t); setSort("new"); }} />
      <div className="mt-6 space-y-6">
        {tops.map((c) => <CommentItem key={c.id} c={c} replies={repliesOf(c.id)} onReply={(p, t) => add(t, p)} />)}
      </div>
    </section>
  );
}
