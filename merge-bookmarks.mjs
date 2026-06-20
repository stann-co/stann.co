// merges every already-cleaned json in "new bookmarks/" with the gallery feed.
// usage:  node merge-bookmarks.mjs
// reads  new bookmarks/*.json  (cleaned exports, same shape as the feed)
//   →  merges them with  public/art-bookmarks/data/bookmarks.clean.json
// newest bookmark_date always ends up at the front.

import { readFile, writeFile, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const NEW_DIR = join(root, "new bookmarks");
const FEED = join(root, "public", "art-bookmarks", "data", "bookmarks.clean.json");

// most recent bookmark_date first (falls back to tweeted_at).
const newestFirst = (a, b) =>
  new Date(b.bookmark_date || b.tweeted_at || 0) -
  new Date(a.bookmark_date || a.tweeted_at || 0);

// collect every bookmark from every json file in "new bookmarks/".
const allFiles = (await readdir(NEW_DIR)).filter((f) => f.endsWith(".json"));
const files = []; // parsed cleanly — these get merged & deleted
const skipped = []; // empty/invalid — left in place for inspection
const incoming = [];
for (const f of allFiles) {
  const text = (await readFile(join(NEW_DIR, f), "utf8")).trim();
  let arr;
  try {
    if (!text) throw new Error("empty file");
    arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error("not a JSON array");
  } catch (err) {
    skipped.push(`${f} (${err.message})`);
    continue;
  }
  files.push(f);
  incoming.push(...arr);
}
incoming.sort(newestFirst);

const existing = JSON.parse(await readFile(FEED, "utf8"));

// skip anything already in the feed (matched by tweet_url).
const seen = new Set(existing.map((b) => b.tweet_url));
const fresh = incoming.filter((b) => !seen.has(b.tweet_url));

const merged = [...fresh, ...existing];
await writeFile(FEED, JSON.stringify(merged), "utf8");

// remove the source files now that they've been merged in.
for (const f of files) {
  await rm(join(NEW_DIR, f));
}

console.log(`files:    ${files.length} merged & deleted (${incoming.length} bookmarks)`);
console.log(`new:      ${fresh.length} merged (${incoming.length - fresh.length} dupes skipped)`);
console.log(`feed:     ${existing.length} → ${merged.length} → ${FEED}`);
if (skipped.length) {
  console.log(`skipped:  ${skipped.length} left in place → ${skipped.join(", ")}`);
}
