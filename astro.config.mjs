// @ts-check
import { defineConfig } from "astro/config";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(root, "public", "art-bookmarks", "data", "bookmarks.clean.json");

// category/sorting tags that can be applied to media in dev mode. Keep this in
// sync with the TAGS list in src/components/Gallery-Card.astro (which renders
// the toggle buttons).
// ("animated" and "painting" aren't here — animated is derived from a media
// item's type (video/animated_gif), and painting is the implicit default for
// any item with no tags, so neither is ever applied by hand.)
const TAGS = ["sketch", "3d", "pixelart", "irl"];

// Reads the data file, applies `mutate` to every media item whose url matches,
// writes back if anything matched, and answers the request. Shared by the nsfw
// and tag admin endpoints below.
/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {(body: any, media: any) => void} mutate
 */
async function mutateMedia(req, res, mutate) {
  res.setHeader("content-type", "application/json");
  try {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);

    const data = JSON.parse(await readFile(DATA_FILE, "utf8"));
    let found = false;
    for (const b of data) {
      for (const m of b.media ?? []) {
        if (m.url !== body.url) continue;
        mutate(body, m);
        found = true;
      }
    }
    if (found) await writeFile(DATA_FILE, JSON.stringify(data), "utf8");

    res.statusCode = found ? 200 : 404;
    res.end(JSON.stringify({ ok: found }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: String(err) }));
  }
}

// Dev-only admin API. `apply: "serve"` keeps it out of `bun run build`, so it
// only exists on the local dev server — the production site stays fully static.
//   POST /__admin/nsfw  { url, nsfw }       → toggles the nsfw flag
//   POST /__admin/tag   { url, tag, on }    → adds/removes a category tag
// on the matching media item in bookmarks.clean.json so it can be queried later.
function adminApi() {
  return {
    name: "art-bookmarks-admin-api",
    apply: "serve",
    /** @param {import("vite").ViteDevServer} server */
    configureServer(server) {
      server.middlewares.use("/__admin/nsfw", (req, res, next) => {
        if (req.method !== "POST") return next();
        return mutateMedia(req, res, ({ nsfw }, m) => {
          if (nsfw) m.nsfw = true;
          else delete m.nsfw;
        });
      });

      server.middlewares.use("/__admin/tag", (req, res, next) => {
        if (req.method !== "POST") return next();
        return mutateMedia(req, res, ({ tag, on }, m) => {
          if (!TAGS.includes(tag)) return; // ignore unknown tags
          const set = new Set(m.tags ?? []);
          if (on) set.add(tag);
          else set.delete(tag);
          if (set.size) m.tags = [...set];
          else delete m.tags; // keep the json lean when no tags remain
        });
      });

      // POST /__admin/checked { url, checked } → marks a media item as reviewed.
      // a workflow flag (not a category) for tracking a big tagging pass; strip
      // it from the data when done. see the "reviewed" toggle in Gallery-Card.
      server.middlewares.use("/__admin/checked", (req, res, next) => {
        if (req.method !== "POST") return next();
        return mutateMedia(req, res, ({ checked }, m) => {
          if (checked) m.checked = true;
          else delete m.checked;
        });
      });

      // POST /__admin/delete { url } → removes the matching media item, and
      // drops the whole bookmark if that was its last media. can't reuse
      // mutateMedia since it restructures the arrays rather than mutating in place.
      server.middlewares.use("/__admin/delete", async (req, res, next) => {
        if (req.method !== "POST") return next();
        res.setHeader("content-type", "application/json");
        try {
          let raw = "";
          for await (const chunk of req) raw += chunk;
          const { url } = JSON.parse(raw);

          const data = JSON.parse(await readFile(DATA_FILE, "utf8"));
          let removed = 0;
          for (const b of data) {
            const before = (b.media ?? []).length;
            b.media = (b.media ?? []).filter((m) => m.url !== url);
            removed += before - b.media.length;
          }
          // drop bookmarks left with no media (nothing to show in the gallery)
          const kept = data.filter((b) => (b.media ?? []).length > 0);
          if (removed) await writeFile(DATA_FILE, JSON.stringify(kept), "utf8");

          res.statusCode = removed ? 200 : 404;
          res.end(JSON.stringify({ ok: removed > 0 }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: String(err) }));
        }
      });
    },
  };
}

// custom domain (CNAME → stann.co), so no `base` is needed.
export default defineConfig({
  site: "https://stann.co",
  vite: { plugins: [adminApi()] },
});
