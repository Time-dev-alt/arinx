export type Visibility = "public" | "unlisted" | "private";

export interface Channel {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  banner: string;
  subscribers: number;
  bio: string;
  joined: string;
  location: string;
}

export interface Video {
  id: string;
  title: string;
  description: string;
  channelId: string;
  src: string;
  thumbnail: string;
  duration: number;
  views: number;
  likes: number;
  publishedAt: string;
  category: string;
  tags: string[];
  visibility: Visibility;
  isShort: boolean;
}

export interface Comment {
  id: string;
  videoId: string;
  parentId?: string;
  author: string;
  avatar: string;
  text: string;
  likes: number;
  createdAt: string;
}

export interface CommunityPost {
  id: string;
  channelId: string;
  text: string;
  image?: string;
  likes: number;
  createdAt: string;
}

export const CATEGORIES = [
  "Music",
  "Gaming",
  "Tech",
  "Cooking",
  "Travel",
  "Science",
  "Sports",
  "Film",
  "Comedy",
  "Education",
];

const GTV = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample";
const STREAMS: { file: string; dur: number }[] = [
  { file: "BigBuckBunny", dur: 596 },
  { file: "ElephantsDream", dur: 653 },
  { file: "Sintel", dur: 888 },
  { file: "TearsOfSteel", dur: 734 },
  { file: "SubaruOutbackOnStreetAndDirt", dur: 594 },
  { file: "VolkswagenGTIReview", dur: 60 },
  { file: "WeAreGoingOnBullrun", dur: 47 },
  { file: "WhatCarCanYouGetForAGrand", dur: 60 },
];
const SHORT_STREAMS = [
  "ForBiggerBlazes",
  "ForBiggerEscapes",
  "ForBiggerFun",
  "ForBiggerJoyrides",
  "ForBiggerMeltdowns",
];

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const BASE_TIME = Date.UTC(2026, 9, 11, 12);
const daysAgo = (d: number) => new Date(BASE_TIME - d * 86400000).toISOString();
const img = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`;
export const avatarFor = (seed: string) => `https://i.pravatar.cc/150?u=${encodeURIComponent(seed)}`;

const CH: [string, string, string, number, string, string][] = [
  ["lofi", "Lofi Lantern", "Music", 2_840_000, "Late-night beats, live sessions and stories behind the songs.", "Lisbon, Portugal"],
  ["pixel", "Pixel Forge", "Gaming", 5_120_000, "Speedruns, deep dives and the weirdest glitches in gaming history.", "Toronto, Canada"],
  ["circuit", "Circuit & Byte", "Tech", 1_930_000, "Honest tech reviews, teardown videos and coding experiments.", "Austin, USA"],
  ["saffron", "Saffron Kitchen", "Cooking", 3_470_000, "Weeknight recipes inspired by street food from around the world.", "Mumbai, India"],
  ["drift", "Drift Atlas", "Travel", 890_000, "Slow travel films. One backpack, no itinerary.", "Reykjavík, Iceland"],
  ["quanta", "Quanta Bits", "Science", 6_700_000, "Big ideas in physics, biology and space, explained in minutes.", "London, UK"],
  ["fullcourt", "Full Court Daily", "Sports", 1_210_000, "Breakdowns, highlights and training drills from the pros.", "Chicago, USA"],
  ["reel", "Reel Theory", "Film", 2_050_000, "Video essays on cinema, editing and storytelling.", "Paris, France"],
  ["giggle", "Giggle Lab", "Comedy", 4_300_000, "Sketches, improv and the occasional bad idea.", "Sydney, Australia"],
  ["chalk", "Chalkline Academy", "Education", 1_640_000, "Math, history and study skills without the boring parts.", "Berlin, Germany"],
];

export const ME_ID = "me";

export const CHANNELS: Channel[] = [
  ...CH.map(([id, name, , subs, bio, loc], i) => ({
    id,
    name,
    handle: id + (i % 3 === 0 ? "tv" : ""),
    avatar: avatarFor(id + "-av"),
    banner: img(id + "-banner", 2048, 340),
    subscribers: subs,
    bio,
    joined: daysAgo(400 + i * 210),
    location: loc,
  })),
  {
    id: ME_ID,
    name: "Your Channel",
    handle: "you",
    avatar: avatarFor("me-avatar-arinx"),
    banner: img("me-banner", 2048, 340),
    subscribers: 1280,
    bio: "Welcome to my channel! Customize this in ArinX Studio.",
    joined: daysAgo(120),
    location: "Earth",
  },
];

const TITLES: Record<string, string[]> = {
  Music: ["Rainy Window Lofi Mix — 2 Hours to Study & Relax", "I Made a Song Using Only Kitchen Sounds", "Live Session: Midnight Train (Acoustic)", "How Synthwave Was Born", "Reacting to My First Song Ever", "Coffee Shop Jazz for Deep Focus"],
  Gaming: ["Beating the Game Without Taking Damage", "The Glitch That Broke Speedrunning Forever", "Ranking Every Boss From Worst to Best", "I Built a Working Computer Inside a Game", "100 Days of Survival — Hardcore Mode", "Why This Indie Game Is a Masterpiece"],
  Tech: ["I Used a Foldable Phone for 30 Days", "Building a Home Server for $200", "The Truth About Battery Health", "Teardown: What's Inside the New Earbuds", "Coding an App in 24 Hours", "Mechanical Keyboard Sound Test (ASMR)"],
  Cooking: ["The Crispiest Street-Style Pakoras", "15-Minute Butter Garlic Noodles", "Perfect Biryani at Home — Step by Step", "Testing Viral TikTok Recipes", "Spicy Ramen From Scratch", "Mango Lassi 3 Ways"],
  Travel: ["48 Hours Alone in the Icelandic Highlands", "The Cheapest Way to Travel Japan", "Night Train Across Europe", "I Lived in a Tiny Fishing Village", "Hidden Beaches No One Talks About", "Hiking to a Glacier Lagoon at Sunrise"],
  Science: ["What Happens Inside a Black Hole?", "The Simplest Explanation of Quantum Entanglement", "Why Is the Ocean Salty?", "How Your Brain Lies to You Every Day", "The Strange Life of Tardigrades", "Could We Terraform Mars?"],
  Sports: ["Top 50 Dunks of the Season", "Pro Shooting Drill You Can Do Alone", "The Greatest Comeback in Finals History", "Breaking Down the Perfect Pick and Roll", "Training Like a Pro Athlete for a Week", "Rookie Season Highlights"],
  Film: ["The Genius Editing of a Classic Thriller", "Why Practical Effects Still Win", "How Directors Use Color to Tell Stories", "Every Shot in This Scene Is a Lie", "The Rise and Fall of the Movie Trailer", "Animated Films That Broke the Rules"],
  Comedy: ["When Your GPS Has Trust Issues", "Office Meetings Be Like", "If Cats Ran a Restaurant", "Me Trying to Be Productive", "Every Group Chat Ever", "Improv: The Worst Job Interview"],
  Education: ["Calculus in 10 Minutes", "The Entire History of Rome, Quickly", "Study Techniques That Actually Work", "How to Remember Anything", "Why Math Is Beautiful", "The Fall of Constantinople Explained"],
};

const SHORT_TITLES = ["Wait for it… 😳", "POV: You found the secret level", "This hack saves so much time", "Rate this from 1 to 10", "Did you know this?", "Satisfying ending 🔥", "One-take challenge", "Day in my life in 30s"];

const TAG_POOL: Record<string, string[]> = {
  Music: ["lofi", "chill", "study music", "beats"],
  Gaming: ["gaming", "speedrun", "walkthrough", "indie"],
  Tech: ["tech", "review", "gadgets", "coding"],
  Cooking: ["recipe", "food", "easy recipes", "street food"],
  Travel: ["travel", "vlog", "adventure", "budget travel"],
  Science: ["science", "space", "physics", "explained"],
  Sports: ["basketball", "highlights", "training", "nba"],
  Film: ["film", "video essay", "cinema", "editing"],
  Comedy: ["comedy", "sketch", "funny", "relatable"],
  Education: ["education", "history", "math", "learning"],
};

function makeDescription(title: string, cat: string, dur: number) {
  const marks = [0, Math.floor(dur * 0.2), Math.floor(dur * 0.45), Math.floor(dur * 0.7)];
  const labels = ["Intro", "Getting started", "The main part", "Final thoughts"];
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return `${title}\n\nThanks for watching! In this video we dig into everything ${cat.toLowerCase()} fans have been asking about. Drop your questions in the comments and don't forget to subscribe for more.\n\nChapters\n${marks.map((m, i) => `${fmt(m)} ${labels[i]}`).join("\n")}\n\nFollow along and share with a friend who'd love this.`;
}

function buildVideos(): Video[] {
  const r = rng(42);
  const out: Video[] = [];
  let n = 0;
  const all = [...CH.map((c) => [c[0], c[2]] as const), [ME_ID, "Tech"] as const];
  for (const [chId, cat] of all) {
    const titles = TITLES[cat];
    const count = chId === ME_ID ? 4 : 6;
    for (let i = 0; i < count; i++) {
      const s = STREAMS[(n + i) % STREAMS.length];
      const id = `v${(n * 7919 + 1000).toString(36)}${i}`;
      const title = titles[i % titles.length];
      out.push({
        id,
        title,
        description: makeDescription(title, cat, s.dur),
        channelId: chId,
        src: `${GTV}/${s.file}.mp4`,
        thumbnail: img(`${id}-${cat}`, 640, 360),
        duration: s.dur,
        views: Math.floor(Math.pow(r(), 2) * 4_000_000) + 1200,
        likes: 0,
        publishedAt: daysAgo(Math.floor(r() * 400) + (i === 0 ? 0 : 1)),
        category: cat,
        tags: TAG_POOL[cat],
        visibility: chId === ME_ID && i === 3 ? "private" : "public",
        isShort: false,
      });
      n++;
    }
    for (let j = 0; j < 2; j++) {
      const id = `s${hash(chId + j).toString(36)}`;
      const t = SHORT_TITLES[(n + j) % SHORT_TITLES.length];
      out.push({
        id,
        title: t,
        description: `${t} #shorts #${cat.toLowerCase()}`,
        channelId: chId,
        src: `${GTV}/${SHORT_STREAMS[(n + j) % SHORT_STREAMS.length]}.mp4`,
        thumbnail: img(`${id}-short`, 405, 720),
        duration: 15,
        views: Math.floor(r() * 9_000_000) + 5000,
        likes: 0,
        publishedAt: daysAgo(Math.floor(r() * 60)),
        category: cat,
        tags: ["shorts", ...TAG_POOL[cat].slice(0, 2)],
        visibility: "public",
        isShort: true,
      });
    }
  }
  for (const v of out) v.likes = Math.floor(v.views * (0.02 + r() * 0.05));
  return out;
}

export const SEED_VIDEOS: Video[] = buildVideos();

const NAMES = ["Maya Chen", "Diego Alvarez", "Priya Nair", "Tom Becker", "Aisha Bello", "Kenji Sato", "Lena Novak", "Omar Haddad", "Sofia Rossi", "Jamal Wright", "Elif Kaya", "Noah Fischer"];
const TEXTS = [
  "This is exactly what I needed today. The editing is so clean!",
  "Who else is watching this at 2am? 😅",
  "The part at 2:15 had me laughing way too hard.",
  "I've been following this channel for years and the quality just keeps getting better.",
  "Can you make a part 2? Please!!",
  "Honestly underrated. More people need to see this.",
  "The background music choice is perfect.",
  "I tried this myself and it actually worked, thank you!",
  "Came here from the recommendations and instantly subscribed.",
  "The amount of research that went into this is insane.",
];
const REPLIES = ["Totally agree!", "Same here 😂", "Facts.", "This comment deserves more likes", "Part 2 when??", "Glad I'm not the only one"];

export function seedComments(videoId: string): Comment[] {
  const r = rng(hash(videoId));
  const out: Comment[] = [];
  const count = 6 + Math.floor(r() * 6);
  for (let i = 0; i < count; i++) {
    const author = NAMES[Math.floor(r() * NAMES.length)];
    const id = `${videoId}-c${i}`;
    out.push({
      id,
      videoId,
      author,
      avatar: avatarFor(author),
      text: TEXTS[Math.floor(r() * TEXTS.length)],
      likes: Math.floor(Math.pow(r(), 3) * 12000),
      createdAt: daysAgo(Math.floor(r() * 90)),
    });
    const reps = Math.floor(r() * 4) - 1;
    for (let k = 0; k < reps; k++) {
      const a = NAMES[Math.floor(r() * NAMES.length)];
      out.push({
        id: `${id}-r${k}`,
        videoId,
        parentId: id,
        author: a,
        avatar: avatarFor(a),
        text: REPLIES[Math.floor(r() * REPLIES.length)],
        likes: Math.floor(r() * 300),
        createdAt: daysAgo(Math.floor(r() * 30)),
      });
    }
  }
  return out;
}

const POSTS = [
  "New video drops this Friday! What should the next one be about? 👇",
  "Behind the scenes from this week's shoot. Thanks for all the support!",
  "We just hit a huge milestone. You all are incredible ❤️",
  "Poll time: long videos or more frequent short ones?",
];
export const COMMUNITY: CommunityPost[] = CHANNELS.flatMap((c, i) =>
  [0, 1].map((j) => ({
    id: `${c.id}-p${j}`,
    channelId: c.id,
    text: POSTS[(i + j) % POSTS.length],
    image: j === 0 ? img(`${c.id}-post`, 800, 450) : undefined,
    likes: 200 + ((i * 37 + j * 91) % 5000),
    createdAt: daysAgo(3 + j * 9 + i),
  })),
);
