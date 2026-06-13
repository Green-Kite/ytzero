import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "./db";

const IMG_DIR = process.env.IMG_CACHE_DIR ?? resolve(import.meta.dir, "../../data/imgcache");
mkdirSync(IMG_DIR, { recursive: true });

// How long a cached image is considered fresh. After this we *try* to refetch,
// but a failed refetch (e.g. 429) keeps serving the old file — it is never
// deleted just because YouTube rate-limited us.
const TTL_MS = Number(process.env.IMG_CACHE_TTL_DAYS ?? 5) * 86_400_000;
// After a failed refetch, wait this long before trying again so we don't hammer
// a rate-limited origin on every request.
const RETRY_AFTER_MS = 30 * 60_000;

db.exec(`
CREATE TABLE IF NOT EXISTS image_cache (
  url           TEXT PRIMARY KEY,
  path          TEXT NOT NULL,
  content_type  TEXT NOT NULL DEFAULT 'image/jpeg',
  fetched_at    INTEGER NOT NULL,
  last_try_at   INTEGER NOT NULL DEFAULT 0
);
`);

const ALLOWED = /^https:\/\/[\w.-]*(ytimg\.com|ggpht\.com|googleusercontent\.com|youtube\.com)\//;

interface Row {
  url: string;
  path: string;
  content_type: string;
  fetched_at: number;
  last_try_at: number;
}

const getRow = db.prepare("SELECT * FROM image_cache WHERE url = ?");
const upsert = db.prepare(`
  INSERT INTO image_cache (url, path, content_type, fetched_at, last_try_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(url) DO UPDATE SET
    path = excluded.path,
    content_type = excluded.content_type,
    fetched_at = excluded.fetched_at,
    last_try_at = excluded.last_try_at
`);
const touchTry = db.prepare("UPDATE image_cache SET last_try_at = ? WHERE url = ?");

function pathFor(url: string): string {
  return `${IMG_DIR}/${createHash("sha1").update(url).digest("hex")}`;
}

// Dedupe concurrent fetches of the same URL (feeds request many at once).
const inflight = new Map<string, Promise<Row | null>>();

async function download(url: string): Promise<Row | null> {
  const path = pathFor(url);
  const now = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Referer: "https://www.youtube.com/",
      },
    });
    if (!res.ok) {
      touchTry.run(now, url);
      return null;
    }
    await Bun.write(path, await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    upsert.run(url, path, contentType, now, now);
    return { url, path, content_type: contentType, fetched_at: now, last_try_at: now };
  } catch {
    touchTry.run(now, url);
    return null;
  }
}

export interface CachedImage {
  path: string;
  contentType: string;
}

/**
 * Return a locally cached copy of a YouTube image. Downloads on first hit,
 * refreshes lazily once stale, and—crucially—keeps serving the previous file
 * if a refresh fails (HTTP 429 / network error) instead of dropping it.
 * Returns null only when there is nothing cached and the fetch failed.
 */
export async function getCachedImage(url: string): Promise<CachedImage | null> {
  if (!ALLOWED.test(url)) return null;
  const row = getRow.get(url) as Row | null;
  const haveFile = row && existsSync(row.path);
  const now = Date.now();

  if (haveFile && now - row!.fetched_at < TTL_MS) {
    return { path: row!.path, contentType: row!.content_type };
  }

  // Stale or missing. Avoid stampeding a rate-limited origin: if we recently
  // failed and still have an old file, serve it without retrying yet.
  if (haveFile && now - row!.last_try_at < RETRY_AFTER_MS) {
    return { path: row!.path, contentType: row!.content_type };
  }

  let promise = inflight.get(url);
  if (!promise) {
    promise = download(url).finally(() => inflight.delete(url));
    inflight.set(url, promise);
  }
  const fresh = await promise;
  if (fresh) return { path: fresh.path, contentType: fresh.content_type };

  // Refresh failed — fall back to the stale file if we have one.
  if (haveFile) return { path: row!.path, contentType: row!.content_type };
  return null;
}
