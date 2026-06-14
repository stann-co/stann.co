// strips x/twitter bookmark exports down to what the gallery actually needs.
// usage:  bun run data   (or: node process-bookmarks.mjs)
// reads  data/bookmarks.json (raw, git-ignored)
//   →  writes  public/art-bookmarks/data/bookmarks.clean.json (served by astro)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const SRC = join(root, "data", "bookmarks.json");
const OUT = join(root, "public", "art-bookmarks", "data", "bookmarks.clean.json");

// picks the highest-bitrate mp4 variant (skips the hls .m3u8 stream).
function bestVideoUrl(variants = []) {
  return variants
    .filter((v) => v.content_type === "video/mp4")
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]?.url ?? null;
}

// reduces one media entry to { type, url, width, height, video_url? }.
function cleanMedia(m) {
  const { width, height } = m.original_info ?? {};
  const out = {
    type: m.type, // photo | video | animated_gif
    url: m.media_url_https, // still image (or video poster frame)
    width: width ?? null,
    height: height ?? null,
  };
  if (m.type !== "photo") {
    out.video_url = bestVideoUrl(m.video_info?.variants);
  }
  return out;
}

function cleanBookmark(b) {
  return {
    author: {
      screen_name: b.screen_name,
      name: b.name,
      profile_image: b.profile_image_url_https,
    },
    // note_tweet_text holds the full body for long tweets; prefer it.
    text: b.note_tweet_text || b.full_text || "",
    tweeted_at: b.tweeted_at,
    bookmark_date: b.bookmark_date,
    tweet_url: b.tweet_url,
    media: (b.extended_media ?? []).map(cleanMedia),
  };
}

const raw = await readFile(SRC, "utf8");
const bookmarks = JSON.parse(raw);

const cleaned = bookmarks
  .map(cleanBookmark)
  // drop text-only bookmarks with no media — nothing to show in a gallery.
  .filter((b) => b.media.length > 0);

const json = JSON.stringify(cleaned);
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, json, "utf8");

// report the savings.
const kb = (n) => `${(n / 1024).toFixed(0)} kb`;
console.log(`in:  ${bookmarks.length} bookmarks (${kb(Buffer.byteLength(raw))})`);
console.log(`out: ${cleaned.length} bookmarks (${kb(Buffer.byteLength(json))}) → ${OUT}`);
