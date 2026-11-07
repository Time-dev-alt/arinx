import type { Channel, Video } from "@/lib/api";
import type { Catalog, PublicChannelMeta, PublicVideoMeta } from "@/lib/catalog";

/**
 * Small offline seed used ONLY when ARINX_DEMO_DATA=1 (local previews and
 * tests). Production never exposes it — the flag is unset on Lovable Cloud,
 * so the sitemap, feeds and metadata always come from the real database.
 */
export const DEMO_MODE = typeof process !== "undefined" && process.env?.ARINX_DEMO_DATA === "1";

type Seed = {
  id: string;
  title: string;
  description: string;
  handle: string;
  channel: string;
  category: string;
  tags: string[];
  duration: number;
  views: number;
  days: number;
  short?: boolean;
};

const SEEDS: Seed[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Building a video platform from scratch in 12 minutes",
    description:
      "A complete walkthrough of the ArinX architecture: streaming, channels, playlists, search and the creator studio.\n\n0:00 Intro\n1:24 The feed\n4:10 Uploads\n9:05 What's next",
    handle: "devtime",
    channel: "Dev Time",
    category: "Tech",
    tags: ["web development", "react", "open source"],
    duration: 742,
    views: 18420,
    days: 1,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Lo-fi beats to code and focus to — 1 hour mix",
    description: "A mellow instrumental mix for deep work, studying and late-night builds.",
    handle: "nightloop",
    channel: "Night Loop",
    category: "Music",
    tags: ["lofi", "focus", "study"],
    duration: 3600,
    views: 92810,
    days: 2,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    title: "We tried the hardest boss in the game for 30 minutes",
    description: "No guides, no hints, just patience. Full run with commentary.",
    handle: "pixelpals",
    channel: "Pixel Pals",
    category: "Gaming",
    tags: ["gaming", "boss fight", "lets play"],
    duration: 1810,
    views: 43120,
    days: 3,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    title: "15-minute paneer butter masala, restaurant style",
    description: "A quick weeknight recipe with pantry ingredients. Full list in the description.",
    handle: "spoonful",
    channel: "Spoonful",
    category: "Cooking",
    tags: ["recipe", "indian food", "quick meals"],
    duration: 912,
    views: 27150,
    days: 4,
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    title: "48 hours in the Western Ghats — monsoon road trip",
    description: "Waterfalls, misty passes and the best chai stop on the way.",
    handle: "roamwithme",
    channel: "Roam With Me",
    category: "Travel",
    tags: ["travel", "india", "road trip"],
    duration: 1240,
    views: 15870,
    days: 6,
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    title: "Why do galaxies spin? A short visual explanation",
    description: "Angular momentum, dark matter halos and a very old question.",
    handle: "sciencebits",
    channel: "Science Bits",
    category: "Science",
    tags: ["astronomy", "physics", "explained"],
    duration: 486,
    views: 71240,
    days: 8,
  },
  {
    id: "77777777-7777-4777-8777-777777777777",
    title: "Sunset skate session in 60 seconds",
    description: "Golden hour, one take, one landing.",
    handle: "pixelpals",
    channel: "Pixel Pals",
    category: "Sports",
    tags: ["shorts", "skate", "sunset"],
    duration: 48,
    views: 128900,
    days: 1,
    short: true,
  },
  {
    id: "88888888-8888-4888-8888-888888888888",
    title: "The tiny kitchen hack that changed my mornings",
    description: "Thirty seconds, one very good cup of coffee.",
    handle: "spoonful",
    channel: "Spoonful",
    category: "Cooking",
    tags: ["shorts", "coffee", "kitchen"],
    duration: 32,
    views: 64210,
    days: 2,
    short: true,
  },
  {
    id: "99999999-9999-4999-8999-999999999999",
    title: "Designing a dark mode that actually works",
    description: "Contrast, semantics and a few Tailwind tricks for readable UI at 2am.",
    handle: "devtime",
    channel: "Dev Time",
    category: "Tech",
    tags: ["ui design", "css", "dark mode"],
    duration: 968,
    views: 33900,
    days: 10,
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    title: "Acoustic cover of a 90s classic (live, one take)",
    description: "Recorded in a stairwell because the reverb is perfect.",
    handle: "nightloop",
    channel: "Night Loop",
    category: "Music",
    tags: ["cover", "acoustic", "live"],
    duration: 224,
    views: 51230,
    days: 12,
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    title: "Every planet in the solar system, to scale",
    description: "If the Sun were a basketball, here is where everything else would be.",
    handle: "sciencebits",
    channel: "Science Bits",
    category: "Education",
    tags: ["space", "education", "scale"],
    duration: 655,
    views: 88400,
    days: 15,
  },
  {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    title: "A quiet morning in Hampi",
    description: "Temples, boulders and the sound of absolutely nothing.",
    handle: "roamwithme",
    channel: "Roam With Me",
    category: "Travel",
    tags: ["shorts", "hampi", "slow travel"],
    duration: 55,
    views: 29870,
    days: 5,
    short: true,
  },
];

const CHANNEL_BIO: Record<string, string> = {
  devtime: "Practical software engineering, architecture teardowns and honest tutorials.",
  nightloop: "Long-form mixes and live sessions for focus, study and slow evenings.",
  pixelpals: "Co-op chaos, boss fights and short clips from the games we love.",
  spoonful: "Fast, unfussy recipes you can actually make on a Tuesday.",
  roamwithme: "Slow travel films from India and beyond.",
  sciencebits: "Big questions, small videos, accurate answers.",
};

const HUES: Record<string, number> = {
  Tech: 210,
  Music: 275,
  Gaming: 340,
  Cooking: 25,
  Travel: 165,
  Science: 245,
  Sports: 195,
  Education: 285,
  Comedy: 45,
  Film: 300,
  Other: 220,
};

function thumb(title: string, category: string): string {
  const hue = HUES[category] ?? 220;
  const label = title.length > 42 ? `${title.slice(0, 41)}…` : title;
  const escaped = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue},65%,22%)"/><stop offset="1" stop-color="hsl(${(hue + 55) % 360},70%,12%)"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><circle cx="320" cy="160" r="46" fill="rgba(255,255,255,.14)"/><path d="M308 138l34 22-34 22z" fill="#fff"/><text x="32" y="300" fill="rgba(255,255,255,.92)" font-family="sans-serif" font-size="24" font-weight="600">${escaped}</text><text x="32" y="332" fill="rgba(255,255,255,.6)" font-family="sans-serif" font-size="16">ArinX · ${category}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function channel(handle: string, name: string, subscribers: number, joined: string): Channel {
  return {
    id: handle,
    name,
    handle,
    avatar: null,
    banner: null,
    avatarPath: null,
    bannerPath: null,
    subscribers,
    bio: CHANNEL_BIO[handle] ?? `Videos from @${handle} on ArinX.`,
    location: "",
    joined,
    links: [],
  };
}

export function demoCatalog(): Catalog {
  const channels = new Map<string, Channel>();
  const videos: Video[] = SEEDS.map((seed, i) => {
    if (!channels.has(seed.handle)) {
      channels.set(
        seed.handle,
        channel(seed.handle, seed.channel, 1200 + i * 340, daysAgo(400 - i * 20)),
      );
    }
    const publishedAt = daysAgo(seed.days);
    return {
      id: seed.id,
      title: seed.title,
      description: seed.description,
      channelId: seed.handle,
      channel: channels.get(seed.handle)!,
      videoPath: "",
      thumbnail: thumb(seed.title, seed.category),
      thumbnailPath: null,
      duration: seed.duration,
      views: seed.views,
      likes: Math.round(seed.views * 0.04),
      publishedAt,
      category: seed.category,
      tags: seed.tags,
      visibility: "public",
      isShort: !!seed.short,
      fingerprint: null,
    };
  });
  return { videos, channels: [...channels.values()], generatedAt: Date.now(), demo: true };
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function demoVideoMeta(id: string): PublicVideoMeta | null {
  const seed = SEEDS.find((s) => s.id === id);
  if (!seed) return null;
  return {
    kind: "video",
    id: seed.id,
    title: seed.title,
    description: seed.description,
    uploaded: daysAgo(seed.days),
    duration: seed.duration,
    views: seed.views,
    category: seed.category,
    tags: seed.tags,
    handle: seed.handle,
    channelName: seed.channel,
    thumbnail: thumb(seed.title, seed.category),
    isShort: !!seed.short,
  };
}

export function demoChannelMeta(handle: string): PublicChannelMeta | null {
  const matching = SEEDS.filter((s) => s.handle === handle);
  if (!matching.length) return null;
  const name = matching[0].channel;
  return {
    kind: "channel",
    id: handle,
    handle,
    title: name,
    description: CHANNEL_BIO[handle] ?? `Watch videos from @${handle} on ArinX.`,
    uploaded: daysAgo(400),
    duration: 0,
    subscribers: 2400,
    joined: daysAgo(400),
    avatar: null,
    recentVideos: matching
      .map((s) => demoVideoMeta(s.id))
      .filter((v): v is PublicVideoMeta => v !== null),
  };
}

export { SEEDS as DEMO_SEEDS };
