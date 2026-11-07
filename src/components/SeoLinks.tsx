import { Link } from "@tanstack/react-router";
import { PUBLIC_CATEGORIES } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Crawlable, server-rendered internal links. The interactive feed is hydrated
 * client-side, so these real <a> elements keep every public video, channel and
 * category reachable by search engine crawlers from the first HTML response.
 */
export function CategoryLinks({ active, className }: { active?: string; className?: string }) {
  return (
    <nav aria-label="Browse video categories" className={cn("flex flex-wrap gap-2", className)}>
      {PUBLIC_CATEGORIES.map((category) => {
        const slug = category.toLowerCase();
        return (
          <Link
            key={category}
            to="/category/$category"
            params={{ category: slug }}
            className={cn(
              "rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-foreground",
              active === slug && "border-primary bg-primary/10 text-foreground",
            )}
          >
            {category} videos
          </Link>
        );
      })}
    </nav>
  );
}

export function VideoLinks({
  title,
  videos,
  className,
}: {
  title: string;
  videos: Array<{ id: string; title: string }>;
  className?: string;
}) {
  if (!videos.length) return null;
  return (
    <section
      className={cn("rounded-2xl border border-border bg-card/40 p-4", className)}
      aria-label={title}
    >
      <h2 className="mb-3 font-display text-base font-semibold">{title}</h2>
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        {videos.slice(0, 24).map((video) => (
          <li key={video.id} className="min-w-0 truncate">
            <Link
              to="/watch/$id"
              params={{ id: video.id }}
              className="text-muted-foreground hover:text-primary hover:underline"
            >
              {video.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CreatorLinks({
  title,
  channels,
  className,
}: {
  title: string;
  channels: Array<{ handle: string; name: string }>;
  className?: string;
}) {
  if (!channels.length) return null;
  return (
    <section
      className={cn("rounded-2xl border border-border bg-card/40 p-4", className)}
      aria-label={title}
    >
      <h2 className="mb-3 font-display text-base font-semibold">{title}</h2>
      <ul className="flex flex-wrap gap-2 text-sm">
        {channels.slice(0, 24).map((channel) => (
          <li key={channel.handle}>
            <Link
              to="/channel/$handle"
              params={{ handle: channel.handle }}
              className="inline-flex rounded-full bg-muted px-3 py-1.5 text-muted-foreground hover:text-primary hover:underline"
            >
              @{channel.handle}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
