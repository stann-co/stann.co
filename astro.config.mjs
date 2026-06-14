// @ts-check
import { defineConfig } from "astro/config";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(root, "public", "art-bookmarks", "data", "bookmarks.clean.json");

// Dev-only admin API. `apply: "serve"` keeps it out of `bun run build`, so it
// only exists on the local dev server — the production site stays fully static.
// POST /__admin/nsfw  { url, nsfw }  → toggles the nsfw flag on the matching
// media item in bookmarks.clean.json so the tag can be queried later.
function adminApi() {
  return {
    name: "art-bookmarks-admin-api",
    apply: "serve",
    /** @param {import("vite").ViteDevServer} server */
    configureServer(server) {
      server.middlewares.use("/__admin/nsfw", async (req, res, next) => {
        if (req.method !== "POST") return next();
        res.setHeader("content-type", "application/json");
        try {
          let body = "";
          for await (const chunk of req) body += chunk;
          const { url, nsfw } = JSON.parse(body);

          const data = JSON.parse(await readFile(DATA_FILE, "utf8"));
          let found = false;
          for (const b of data) {
            for (const m of b.media ?? []) {
              if (m.url !== url) continue;
              if (nsfw) m.nsfw = true;
              else delete m.nsfw;
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
      });
    },
  };
}

// custom domain (CNAME → stann.co), so no `base` is needed.
export default defineConfig({
  site: "https://stann.co",
  vite: { plugins: [adminApi()] },
});
