import { useState } from "react";
import { Copy, ExternalLink, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { embedLink, watchLink } from "@/lib/watch-tools";
import { socialLink } from "@/lib/growth";
import { duration } from "@/lib/format";

export function ShareDialog({ id, title, time, open, onOpenChange }: {
  id: string; title: string; time: number; open: boolean; onOpenChange: (value: boolean) => void;
}) {
  const [timestamp, setTimestamp] = useState(false);
  const origin = typeof window === "undefined" ? "https://arin-x.lovable.app" : window.location.origin;
  const url = watchLink(origin, id, timestamp ? time : 0);
  const embed = `<iframe src="${embedLink(origin, id, timestamp ? time : 0)}" width="560" height="315" title="ArinX video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); toast.success("Copied to clipboard"); }
    catch { toast.error("Couldn't copy. Select and copy the text instead."); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85vh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>Share video</DialogTitle><DialogDescription className="break-words">{title}</DialogDescription></DialogHeader>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" asChild><a href={`https://wa.me/?text=${encodeURIComponent(title + " " + socialLink(url, "whatsapp"))}`} target="_blank" rel="noopener noreferrer">WhatsApp <ExternalLink /></a></Button>
        <Button variant="secondary" asChild><a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(socialLink(url, "x"))}`} target="_blank" rel="noopener noreferrer">X <ExternalLink /></a></Button>
        <Button variant="secondary" asChild><a href={`https://t.me/share/url?url=${encodeURIComponent(socialLink(url, "telegram"))}&text=${encodeURIComponent(title)}`} target="_blank" rel="noopener noreferrer">Telegram <ExternalLink /></a></Button>
        <Button variant="secondary" asChild><a href={`https://www.reddit.com/submit?url=${encodeURIComponent(socialLink(url, "reddit"))}&title=${encodeURIComponent(title)}`} target="_blank" rel="noopener noreferrer">Reddit <ExternalLink /></a></Button>
        {typeof navigator !== "undefined" && !!navigator.share && <Button variant="secondary" onClick={() => void navigator.share({ title, url }).catch(() => {})}><Share2 /> Share</Button>}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={timestamp} onChange={e => setTimestamp(e.target.checked)} />Start at {duration(time)}</label>
      <div className="flex min-w-0 gap-2"><input aria-label="Video link" readOnly value={url} className="min-w-0 flex-1 rounded-md border border-input bg-muted px-3 text-sm" /><Button onClick={() => void copy(url)} title="Copy link"><Copy />Copy</Button></div>
      <label className="space-y-2 text-sm font-medium">Embed<textarea aria-label="Embed code" readOnly value={embed} rows={4} className="w-full resize-none rounded-md border border-input bg-muted p-3 font-mono text-xs" /></label>
      <Button variant="outline" onClick={() => void copy(embed)}><Copy />Copy embed code</Button>
    </DialogContent>
  </Dialog>;
}