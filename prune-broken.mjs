// checks every media url in the gallery feed and removes the ones twitter says
// are gone (404/410), dropping any bookmark left with no media.
// usage:  node prune-broken.mjs          (check + remove)
//         node prune-broken.mjs --dry    (check + report only, no changes)
// only a definite 404/410 counts as broken — timeouts, rate limits (429) and
// 5xx are reported as "unsure" and left alone, so a flaky run can't delete art.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const FEED = join(root, "public", "art-bookmarks", "data", "bookmarks.clean.json");
const DRY = process.argv.includes("--dry");
const CONCURRENCY = 24;

const data = JSON.parse(await readFile(FEED, "utf8"));
const urls = [...new Set(data.flatMap((b) => (b.media ?? []).map((m) => m.url)))];

// returns "ok" | "broken" | "unsure"
async function check(url) {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15000) });
    if (res.status === 404 || res.status === 410) return "broken";
    return res.ok ? "ok" : "unsure";
  } catch {
    return "unsure";
  }
}

// checks `list` with `concurrency` parallel requests; returns broken + unsure.
async function checkAll(list, concurrency) {
  const broken = new Set();
  const unsure = [];
  let done = 0;
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const url = list[next++];
      const result = await check(url);
      if (result === "broken") broken.add(url);
      else if (result === "unsure") unsure.push(url);
      if (++done % 500 === 0) console.log(`  checked ${done}/${list.length}…`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { broken, unsure };
}

console.log(`checking ${urls.length} media urls…`);
const first = await checkAll(urls, CONCURRENCY);

// twitter occasionally 404s a url that's actually fine, and rate-limits fast
// runs, so recheck anything that wasn't "ok" slowly. only urls that 404 both
// times get removed.
const suspects = [...first.broken, ...first.unsure];
console.log(`rechecking ${suspects.length} suspect urls slowly…`);
const second = await checkAll(suspects, 4);
const broken = new Set([...second.broken].filter((url) => first.broken.has(url)));
const unsure = suspects.filter((url) => !broken.has(url) && (second.broken.has(url) || second.unsure.includes(url)));

console.log(`\nbroken: ${broken.size}   unsure (left alone): ${unsure.length}`);
for (const url of broken) console.log(`  ✗ ${url}`);
if (unsure.length) console.log(`  (re-run later to recheck the ${unsure.length} unsure urls)`);

if (DRY || broken.size === 0) process.exit(0);

// remove broken media, then drop bookmarks with nothing left to show.
for (const b of data) b.media = (b.media ?? []).filter((m) => !broken.has(m.url));
const kept = data.filter((b) => b.media.length > 0);
await writeFile(FEED, JSON.stringify(kept), "utf8");
console.log(`\nremoved ${broken.size} media, ${data.length - kept.length} bookmarks now empty and dropped.`);
