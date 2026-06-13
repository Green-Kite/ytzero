import { Hono } from "hono";
import { db, getSetting, setSetting, SETTING_DEFAULTS } from "./db";
import {
  fetchChannelAbout,
  fetchChannelPlaylists,
  fetchChannelVideosDurations,
  fetchPlaylistVideos,
  parseOpml,
  parseTakeoutCsv,
  resolveChannelId,
} from "./youtube";
import { getCachedImage } from "./imgcache";
import { refreshAll, refreshChannel, refreshLiveStatus, syncChannel } from "./refresher";
import { applyRuleToAllVideos } from "./autotags";
import { applyPlaylistRuleToAllVideos, applyPlaylistRulesForPlaylist } from "./userPlaylists";
import { applyFilterRuleToAll } from "./filterRules";

export const api = new Hono();

// ---------- helpers ----------

interface VideoRow {
  video_id: string;
  channel_id: string;
  title: string;
  description: string;
  thumbnail: string;
  published_at: string | null;
  live_status: string;
  status: string;
  bucket: string | null;
  is_short: number | null;
  views: number | null;
  likes: number | null;
  channel_title: string;
}

function attachTags(videos: VideoRow[]) {
  if (videos.length === 0) return [];
  const ids = videos.map((v) => v.video_id);
  const ph = ids.map(() => "?").join(",");
  const videoTags = db
    .prepare(
      `SELECT vt.video_id, t.id, t.name, t.color, vt.source FROM video_tags vt
       JOIN tags t ON t.id = vt.tag_id WHERE vt.video_id IN (${ph})`
    )
    .all(...ids) as any[];
  const channelIds = [...new Set(videos.map((v) => v.channel_id))];
  const chPh = channelIds.map(() => "?").join(",");
  const channelTags = db
    .prepare(
      `SELECT ct.channel_id, t.id, t.name, t.color FROM channel_tags ct
       JOIN tags t ON t.id = ct.tag_id WHERE ct.channel_id IN (${chPh})`
    )
    .all(...channelIds) as any[];

  return videos.map((v) => {
    const own = videoTags
      .filter((t) => t.video_id === v.video_id)
      .map((t) => ({ id: t.id, name: t.name, color: t.color, source: t.source }));
    const inherited = channelTags
      .filter((t) => t.channel_id === v.channel_id && !own.some((o) => o.id === t.id))
      .map((t) => ({ id: t.id, name: t.name, color: t.color, source: "channel" }));
    return { ...v, tags: [...own, ...inherited] };
  });
}

/** WHERE fragment matching videos that have ANY of the given tags (own or via channel). */
function tagFilterSql(tagIds: number[]) {
  const ph = tagIds.map(() => "?").join(",");
  return {
    sql: `(EXISTS (SELECT 1 FROM video_tags vt WHERE vt.video_id = v.video_id AND vt.tag_id IN (${ph}))
       OR EXISTS (SELECT 1 FROM channel_tags ct WHERE ct.channel_id = v.channel_id AND ct.tag_id IN (${ph})))`,
    params: [...tagIds, ...tagIds],
  };
}

const BASE_SELECT = `
  SELECT v.video_id, v.channel_id, v.title, v.description, v.thumbnail,
         v.published_at, v.live_status, v.status, v.bucket, v.show_from, v.is_short, v.views, v.likes,
         v.duration, v.watch_position, v.watch_duration,
         c.title AS channel_title, c.thumbnail AS channel_thumbnail, c.subscriber_count AS channel_subscriber_count
  FROM videos v JOIN channels c ON c.channel_id = v.channel_id`;

function localSQLite(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

function computeShowFrom(bucket: string): string {
  const now = new Date();
  const d = new Date(now);
  const h = now.getHours();

  if (bucket === "today") {
    return localSQLite(now);
  } else if (bucket === "tonight") {
    // Today at 19:00 if before, otherwise immediately.
    if (h < 19) d.setHours(19, 0, 0, 0);
    else return localSQLite(now);
  } else if (bucket === "tomorrow") {
    // Always tomorrow 06:00
    d.setDate(d.getDate() + 1);
    d.setHours(6, 0, 0, 0);
  } else if (bucket === "weekend") {
    const day = d.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) {
      return localSQLite(now); // already weekend → now
    }
    const daysUntilSat = (6 - day + 7) % 7;
    d.setDate(d.getDate() + daysUntilSat);
    d.setHours(0, 0, 0, 0);
  }
  return localSQLite(d);
}

// ---------- feed ----------

api.get("/feed", (c) => {
  const page = Math.max(0, Number(c.req.query("page") ?? 0));
  const limit = Math.min(100, Number(c.req.query("limit") ?? 40));
  const q = c.req.query("q")?.trim();
  const channel = c.req.query("channel");
  const tagsParam = c.req.query("tags"); // comma-separated tag ids
  const status = c.req.query("status") ?? "inbox"; // inbox | all

  const where: string[] = [];
  const params: any[] = [];
  if (status !== "all") {
    where.push("v.status = ?");
    params.push(status);
  }
  if (channel) {
    where.push("v.channel_id = ?");
    params.push(channel);
  } else {
    where.push("c.followed = 1");
  }
  if (q) {
    where.push("(v.title LIKE ? OR v.description LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  // shorts=1 forces shorts in (used by the channel page); otherwise the
  // global setting decides.
  if (c.req.query("shorts") !== "1" && getSetting("show_shorts") !== "1") {
    where.push("COALESCE(v.is_short, 0) = 0");
  }
  if (tagsParam) {
    const tagIds = tagsParam.split(",").map(Number).filter(Boolean);
    if (tagIds.length) {
      const f = tagFilterSql(tagIds);
      where.push(f.sql);
      params.push(...f.params);
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(`${BASE_SELECT} ${whereSql} ORDER BY v.published_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, page * limit) as VideoRow[];
  return c.json({ videos: attachTags(rows), page, limit });
});

api.get("/live", (c) => {
  const rows = db
    .prepare(`${BASE_SELECT} WHERE v.live_status IN ('live','upcoming') ORDER BY v.live_status = 'live' DESC, v.published_at DESC`)
    .all() as VideoRow[];
  return c.json({ videos: attachTags(rows) });
});

api.get("/watchlist", (c) => {
  const rows = db
    .prepare(`${BASE_SELECT} WHERE v.status = 'queued' ORDER BY v.queued_at DESC`)
    .all() as VideoRow[];
  return c.json({ videos: attachTags(rows) });
});

api.get("/archive", (c) => {
  const page = Math.max(0, Number(c.req.query("page") ?? 0));
  const rows = db
    .prepare(`${BASE_SELECT} WHERE v.status = 'archived' ORDER BY v.published_at DESC LIMIT 60 OFFSET ?`)
    .all(page * 60) as VideoRow[];
  return c.json({ videos: attachTags(rows), page });
});

api.get("/videos/:id", (c) => {
  const row = db
    .prepare(`${BASE_SELECT} WHERE v.video_id = ?`)
    .get(c.req.param("id")) as VideoRow | null;
  if (!row) return c.json({ error: "not found" }, 404);
  const [video] = attachTags([row]);

  // Collect all tag IDs for this video (direct + via channel)
  const tagRows = db.prepare(`
    SELECT DISTINCT tag_id FROM (
      SELECT tag_id FROM video_tags WHERE video_id = ?
      UNION
      SELECT tag_id FROM channel_tags WHERE channel_id = ?
    )
  `).all(row.video_id, row.channel_id) as { tag_id: number }[];

  let related: VideoRow[];
  if (tagRows.length > 0) {
    const ids = tagRows.map((t) => t.tag_id);
    const ph = ids.map(() => "?").join(",");
    related = db.prepare(
      `${BASE_SELECT} WHERE v.video_id != ? AND v.status != 'archived'
       AND (EXISTS (SELECT 1 FROM video_tags vt WHERE vt.video_id = v.video_id AND vt.tag_id IN (${ph}))
            OR  EXISTS (SELECT 1 FROM channel_tags ct WHERE ct.channel_id = v.channel_id AND ct.tag_id IN (${ph})))
       ORDER BY v.published_at DESC LIMIT 20`
    ).all(row.video_id, ...ids, ...ids) as VideoRow[];
  } else {
    related = db.prepare(
      `${BASE_SELECT} WHERE v.channel_id = ? AND v.video_id != ? ORDER BY v.published_at DESC LIMIT 12`
    ).all(row.channel_id, row.video_id) as VideoRow[];
  }

  return c.json({ video, related: attachTags(related) });
});

// ---------- video actions ----------

const BUCKETS = ["today", "tonight", "tomorrow", "weekend"];

api.post("/videos/:id/queue", async (c) => {
  const { bucket } = await c.req.json();
  if (!BUCKETS.includes(bucket)) return c.json({ error: "invalid bucket" }, 400);
  const showFrom = computeShowFrom(bucket);
  db.prepare(
    "UPDATE videos SET status = 'queued', bucket = ?, queued_at = datetime('now'), show_from = ? WHERE video_id = ?"
  ).run(bucket, showFrom, c.req.param("id"));
  return c.json({ ok: true });
});

api.post("/videos/:id/archive", (c) => {
  db.prepare("UPDATE videos SET status = 'archived', bucket = NULL, show_from = NULL WHERE video_id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

api.post("/videos/:id/restore", (c) => {
  db.prepare("UPDATE videos SET status = 'inbox', bucket = NULL, show_from = NULL WHERE video_id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

api.post("/videos/:id/dequeue", (c) => {
  db.prepare("UPDATE videos SET status = 'inbox', bucket = NULL, queued_at = NULL, show_from = NULL WHERE video_id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

api.post("/videos/:id/watch", (c) => {
  const id = c.req.param("id");
  db.prepare("INSERT INTO history (video_id) VALUES (?)").run(id);
  return c.json({ ok: true });
});

api.put("/videos/:id/progress", async (c) => {
  const id = c.req.param("id");
  const { position, duration } = await c.req.json() as { position: number; duration: number };
  db.prepare("UPDATE videos SET watch_position = ?, watch_duration = ? WHERE video_id = ?").run(position, duration, id);
  return c.json({ ok: true });
});

api.post("/videos/:id/tags", async (c) => {
  const { tag_id } = await c.req.json();
  db.prepare("INSERT OR IGNORE INTO video_tags (video_id, tag_id, source) VALUES (?, ?, 'manual')").run(
    c.req.param("id"),
    tag_id
  );
  return c.json({ ok: true });
});

api.delete("/videos/:id/tags/:tagId", (c) => {
  db.prepare("DELETE FROM video_tags WHERE video_id = ? AND tag_id = ?").run(
    c.req.param("id"),
    c.req.param("tagId")
  );
  return c.json({ ok: true });
});

// ---------- history ----------

api.get("/history", (c) => {
  const page = Math.max(0, Number(c.req.query("page") ?? 0));
  const rows = db
    .prepare(
      `SELECT MAX(h.id) AS history_id, MAX(h.watched_at) AS watched_at,
              v.video_id, v.channel_id, v.title, v.description, v.duration,
              v.thumbnail, v.published_at, v.live_status, v.status, v.bucket,
              c.title AS channel_title, c.thumbnail AS channel_thumbnail
       FROM history h JOIN videos v ON v.video_id = h.video_id
       JOIN channels c ON c.channel_id = v.channel_id
       GROUP BY v.video_id
       ORDER BY MAX(h.watched_at) DESC LIMIT 60 OFFSET ?`
    )
    .all(page * 60) as (VideoRow & { history_id: number; watched_at: string })[];
  return c.json({ videos: attachTags(rows as VideoRow[]), page });
});

api.delete("/history/:id", (c) => {
  db.prepare("DELETE FROM history WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- channels ----------

api.get("/channels", (c) => {
  const channels = db.prepare("SELECT * FROM channels ORDER BY title COLLATE NOCASE").all() as any[];
  const tags = db
    .prepare(
      `SELECT ct.channel_id, t.id, t.name, t.color FROM channel_tags ct JOIN tags t ON t.id = ct.tag_id`
    )
    .all() as any[];
  return c.json({
    channels: channels.map((ch) => ({
      ...ch,
      tags: tags.filter((t) => t.channel_id === ch.channel_id).map((t) => ({ id: t.id, name: t.name, color: t.color })),
    })),
  });
});

api.post("/channels", async (c) => {
  const { url } = await c.req.json();
  if (!url) return c.json({ error: "url required" }, 400);
  const info = await resolveChannelId(url);
  db.prepare(
    "INSERT OR IGNORE INTO channels (channel_id, title, url, thumbnail) VALUES (?, ?, ?, ?)"
  ).run(info.channelId, info.title, `https://www.youtube.com/channel/${info.channelId}`, info.thumbnail);
  refreshChannel(info.channelId)
    .then(() => refreshLiveStatus(info.channelId))
    .catch(console.error);
  return c.json({ ok: true, channel_id: info.channelId, title: info.title });
});

api.delete("/channels/:id", (c) => {
  db.prepare("DELETE FROM channels WHERE channel_id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

api.post("/channels/:id/tags", async (c) => {
  const { tag_id } = await c.req.json();
  const channelId = c.req.param("id");
  db.prepare("INSERT OR IGNORE INTO channel_tags (channel_id, tag_id) VALUES (?, ?)").run(channelId, tag_id);
  // Propagate to all existing videos of this channel
  db.prepare(
    "INSERT OR IGNORE INTO video_tags (video_id, tag_id, source) SELECT video_id, ?, 'channel' FROM videos WHERE channel_id = ?"
  ).run(tag_id, channelId);
  return c.json({ ok: true });
});

api.delete("/channels/:id/tags/:tagId", (c) => {
  const channelId = c.req.param("id");
  const tagId = c.req.param("tagId");
  db.prepare("DELETE FROM channel_tags WHERE channel_id = ? AND tag_id = ?").run(channelId, tagId);
  // Remove channel-propagated tags from videos (keep manually added ones)
  db.prepare(
    "DELETE FROM video_tags WHERE tag_id = ? AND source = 'channel' AND video_id IN (SELECT video_id FROM videos WHERE channel_id = ?)"
  ).run(tagId, channelId);
  return c.json({ ok: true });
});

api.get("/channels/:id/about", async (c) => {
  const channelId = c.req.param("id");
  try {
    const about = await fetchChannelAbout(channelId);
    // Persist fresh avatar, title and subscriber count
    if (about.avatar || about.stats.length > 0) {
      db.prepare("UPDATE channels SET thumbnail = ?, title = ?, subscriber_count = ? WHERE channel_id = ?")
        .run(about.avatar || null, about.title || null, about.stats[0] ?? null, channelId);
    }
    // Background: populate durations for this channel's videos
    fetchChannelVideosDurations(channelId).then((durations) => {
      const upd = db.prepare("UPDATE videos SET duration = ? WHERE video_id = ? AND duration IS NULL");
      for (const d of durations) upd.run(d.duration, d.videoId);
    }).catch(() => {});
    return c.json(about);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

api.get("/channels/:id/playlists", async (c) => {
  try {
    return c.json({ playlists: await fetchChannelPlaylists(c.req.param("id")) });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

api.put("/channels/:id/follow", async (c) => {
  const { followed } = await c.req.json<{ followed: boolean }>();
  db.prepare("UPDATE channels SET followed = ? WHERE channel_id = ?").run(followed ? 1 : 0, c.req.param("id"));
  return c.json({ ok: true });
});

// Literal paths before parameterised /channels/:id to avoid shadowing
api.get("/channels/unfollowed", (c) => {
  const channels = db.prepare("SELECT * FROM channels WHERE followed = 0 ORDER BY title COLLATE NOCASE").all() as any[];
  return c.json({ channels });
});

api.get("/channels/recent", (c) => {
  const shortsFilter = getSetting("show_shorts") === "1"
    ? ""
    : "AND COALESCE(is_short, 0) = 0";
  const rows = db.prepare(`
    SELECT c.channel_id, c.title, c.thumbnail,
           (SELECT thumbnail FROM videos WHERE channel_id = c.channel_id ${shortsFilter} ORDER BY published_at DESC LIMIT 1) AS latest_thumbnail,
           (SELECT video_id FROM videos WHERE channel_id = c.channel_id ${shortsFilter} ORDER BY published_at DESC LIMIT 1) AS latest_video_id
    FROM channels c
    WHERE c.followed = 1
    ORDER BY COALESCE(
      (SELECT published_at FROM videos WHERE channel_id = c.channel_id ${shortsFilter} ORDER BY published_at DESC LIMIT 1),
      '1970-01-01'
    ) DESC
    LIMIT 20
  `).all() as any[];
  return c.json({ channels: rows });
});

api.get("/channels/:id", (c) => {
  const ch = db.prepare("SELECT * FROM channels WHERE channel_id = ?").get(c.req.param("id")) as any;
  if (!ch) return c.json({ error: "not found" }, 404);
  const tags = db
    .prepare(
      `SELECT t.id, t.name, t.color FROM channel_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.channel_id = ?`
    )
    .all(c.req.param("id")) as any[];
  return c.json({ channel: { ...ch, tags } });
});

api.post("/channels/:id/sync", async (c) => {
  const channelId = c.req.param("id");
  try {
    const result = await syncChannel(channelId);
    return c.json({ ok: true, added: result.added });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// ---------- user playlists ----------

api.get("/playlists", (c) => {
  const videoId = c.req.query("video_id");
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.icon, p.sort_order, p.created_at,
              COUNT(pv.video_id) AS video_count
              ${videoId ? ", EXISTS(SELECT 1 FROM user_playlist_videos cpv WHERE cpv.playlist_id = p.id AND cpv.video_id = ?) AS has_video" : ""}
       FROM user_playlists p
       LEFT JOIN user_playlist_videos pv ON pv.playlist_id = p.id
       GROUP BY p.id
       ORDER BY p.sort_order ASC, p.name COLLATE NOCASE`
    )
    .all(...(videoId ? [videoId] : []));
  return c.json({ playlists: rows });
});

api.post("/playlists", async (c) => {
  const { name, icon = "ListMusic" } = await c.req.json();
  if (!name?.trim()) return c.json({ error: "name required" }, 400);
  const nextOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS sort_order FROM user_playlists").get() as { sort_order: number };
  const row = db
    .prepare("INSERT INTO user_playlists (name, icon, sort_order) VALUES (?, ?, ?) RETURNING id, name, icon, sort_order, created_at")
    .get(name.trim(), String(icon || "ListMusic").trim() || "ListMusic", nextOrder.sort_order);
  return c.json({ playlist: row });
});

api.put("/playlists/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const current = db.prepare("SELECT * FROM user_playlists WHERE id = ?").get(id) as any;
  if (!current) return c.json({ error: "not found" }, 404);
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : current.name;
  const icon = typeof body.icon === "string" && body.icon.trim() ? body.icon.trim() : current.icon;
  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : current.sort_order;
  const row = db
    .prepare("UPDATE user_playlists SET name = ?, icon = ?, sort_order = ? WHERE id = ? RETURNING id, name, icon, sort_order, created_at")
    .get(name, icon, sortOrder, id);
  return c.json({ playlist: row });
});

api.delete("/playlists/:id", (c) => {
  db.prepare("DELETE FROM user_playlists WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

api.get("/playlists/:id", (c) => {
  const id = Number(c.req.param("id"));
  const playlist = db
    .prepare(
      `SELECT p.id, p.name, p.icon, p.sort_order, p.created_at, COUNT(pv.video_id) AS video_count
       FROM user_playlists p
       LEFT JOIN user_playlist_videos pv ON pv.playlist_id = p.id
       WHERE p.id = ?
       GROUP BY p.id`
    )
    .get(id) as any;
  if (!playlist) return c.json({ error: "not found" }, 404);
  const rows = db
    .prepare(
      `${BASE_SELECT}
       JOIN user_playlist_videos upv ON upv.video_id = v.video_id
       WHERE upv.playlist_id = ?
       ORDER BY upv.added_at DESC`
    )
    .all(id) as VideoRow[];
  return c.json({ playlist, videos: attachTags(rows) });
});

api.post("/playlists/:id/videos", async (c) => {
  const { video_id } = await c.req.json();
  if (!video_id) return c.json({ error: "video_id required" }, 400);
  db.prepare("INSERT OR IGNORE INTO user_playlist_videos (playlist_id, video_id) VALUES (?, ?)").run(c.req.param("id"), video_id);
  return c.json({ ok: true });
});

api.delete("/playlists/:id/videos/:videoId", (c) => {
  db.prepare("DELETE FROM user_playlist_videos WHERE playlist_id = ? AND video_id = ?").run(
    c.req.param("id"),
    c.req.param("videoId")
  );
  return c.json({ ok: true });
});

api.get("/playlists/:id/rules", (c) => {
  const rules = db.prepare("SELECT * FROM user_playlist_rules WHERE playlist_id = ? ORDER BY id").all(c.req.param("id"));
  return c.json({ rules });
});

api.post("/playlists/:id/rules", async (c) => {
  const { pattern, match_type = "contains", field = "title" } = await c.req.json();
  if (!pattern?.trim()) return c.json({ error: "pattern required" }, 400);
  if (!["contains", "regex"].includes(match_type)) return c.json({ error: "invalid match_type" }, 400);
  if (!["title", "description", "both"].includes(field)) return c.json({ error: "invalid field" }, 400);
  const row = db
    .prepare("INSERT INTO user_playlist_rules (playlist_id, pattern, match_type, field) VALUES (?, ?, ?, ?) RETURNING *")
    .get(c.req.param("id"), pattern.trim(), match_type, field) as any;
  const matched = applyPlaylistRuleToAllVideos(row.id);
  return c.json({ rule: row, matched });
});

api.delete("/playlists/:id/rules/:ruleId", (c) => {
  db.prepare("DELETE FROM user_playlist_rules WHERE playlist_id = ? AND id = ?").run(c.req.param("id"), c.req.param("ruleId"));
  return c.json({ ok: true });
});

api.post("/playlists/:id/rules/apply", (c) => {
  const matched = applyPlaylistRulesForPlaylist(Number(c.req.param("id")));
  return c.json({ ok: true, matched });
});

api.get("/playlists/:id/videos", async (c) => {
  try {
    return c.json({ videos: await fetchPlaylistVideos(c.req.param("id")) });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

api.post("/channels/import", async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "file required" }, 400);
  const content = await file.text();
  const entries = content.trimStart().startsWith("<")
    ? parseOpml(content)
    : parseTakeoutCsv(content);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO channels (channel_id, title, url) VALUES (?, ?, ?)"
  );
  let added = 0;
  for (const e of entries) {
    const r = insert.run(e.channelId, e.title, `https://www.youtube.com/channel/${e.channelId}`);
    if (r.changes > 0) added++;
  }
  refreshAll().catch(console.error);
  return c.json({ ok: true, found: entries.length, added });
});

// ---------- tags ----------

api.get("/tags", (c) => {
  const tags = db
    .prepare(
      `SELECT t.*,
        (SELECT COUNT(*) FROM video_tags vt WHERE vt.tag_id = t.id) AS video_count,
        (SELECT COUNT(*) FROM channel_tags ct WHERE ct.tag_id = t.id) AS channel_count
       FROM tags t ORDER BY t.name COLLATE NOCASE`
    )
    .all();
  return c.json({ tags });
});

api.post("/tags", async (c) => {
  const { name, color } = await c.req.json();
  if (!name?.trim()) return c.json({ error: "name required" }, 400);
  const r = db
    .prepare("INSERT INTO tags (name, color) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET color = excluded.color RETURNING *")
    .get(name.trim(), color ?? "#7c5cff");
  return c.json({ tag: r });
});

api.patch("/tags/:id", async (c) => {
  const { name, color } = await c.req.json();
  const id = c.req.param("id");
  if (name !== undefined) db.prepare("UPDATE tags SET name = ? WHERE id = ?").run(name.trim(), id);
  if (color !== undefined) db.prepare("UPDATE tags SET color = ? WHERE id = ?").run(color, id);
  const tag = db.prepare("SELECT * FROM tags WHERE id = ?").get(id);
  return c.json({ tag });
});

api.delete("/tags/:id", (c) => {
  db.prepare("DELETE FROM tags WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- auto-tag rules ----------

api.get("/rules", (c) => {
  const rules = db
    .prepare(
      `SELECT r.*, t.name AS tag_name, t.color AS tag_color FROM auto_tag_rules r JOIN tags t ON t.id = r.tag_id ORDER BY r.id`
    )
    .all();
  return c.json({ rules });
});

api.post("/rules", async (c) => {
  const { tag_id, pattern, match_type = "contains", field = "title" } = await c.req.json();
  if (!tag_id || !pattern?.trim()) return c.json({ error: "tag_id and pattern required" }, 400);
  const r = db
    .prepare("INSERT INTO auto_tag_rules (tag_id, pattern, match_type, field) VALUES (?, ?, ?, ?) RETURNING *")
    .get(tag_id, pattern.trim(), match_type, field) as any;
  const matched = applyRuleToAllVideos(r.id);
  return c.json({ rule: r, matched });
});

api.patch("/rules/:id", async (c) => {
  const { tag_id, pattern, match_type, field } = await c.req.json();
  const id = c.req.param("id");
  if (tag_id !== undefined) db.prepare("UPDATE auto_tag_rules SET tag_id = ? WHERE id = ?").run(tag_id, id);
  if (pattern !== undefined) db.prepare("UPDATE auto_tag_rules SET pattern = ? WHERE id = ?").run(pattern.trim(), id);
  if (match_type !== undefined) db.prepare("UPDATE auto_tag_rules SET match_type = ? WHERE id = ?").run(match_type, id);
  if (field !== undefined) db.prepare("UPDATE auto_tag_rules SET field = ? WHERE id = ?").run(field, id);
  const rule = db.prepare("SELECT r.*, t.name AS tag_name, t.color AS tag_color FROM auto_tag_rules r JOIN tags t ON t.id = r.tag_id WHERE r.id = ?").get(id);
  return c.json({ rule });
});

api.delete("/rules/:id", (c) => {
  db.prepare("DELETE FROM auto_tag_rules WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- filter rules ----------

api.get("/filter-rules", (c) => {
  const rules = db.prepare(
    `SELECT fr.*, c.title AS channel_title FROM filter_rules fr
     LEFT JOIN channels c ON c.channel_id = fr.channel_id ORDER BY fr.id`
  ).all();
  return c.json({ rules });
});

api.post("/filter-rules", async (c) => {
  const { pattern, match_type = "contains", field = "title", action = "reject", channel_id = null } = await c.req.json();
  if (!pattern?.trim()) return c.json({ error: "pattern required" }, 400);
  const row = db
    .prepare("INSERT INTO filter_rules (pattern, match_type, field, action, channel_id) VALUES (?, ?, ?, ?, ?) RETURNING *")
    .get(pattern.trim(), match_type, field, action, channel_id || null) as any;
  const archived = applyFilterRuleToAll(row.id);
  return c.json({ rule: row, archived });
});

api.patch("/filter-rules/:id", async (c) => {
  const { pattern, match_type, field, action, channel_id } = await c.req.json();
  const id = c.req.param("id");
  if (pattern !== undefined) db.prepare("UPDATE filter_rules SET pattern = ? WHERE id = ?").run(pattern.trim(), id);
  if (match_type !== undefined) db.prepare("UPDATE filter_rules SET match_type = ? WHERE id = ?").run(match_type, id);
  if (field !== undefined) db.prepare("UPDATE filter_rules SET field = ? WHERE id = ?").run(field, id);
  if (action !== undefined) db.prepare("UPDATE filter_rules SET action = ? WHERE id = ?").run(action, id);
  if (channel_id !== undefined) db.prepare("UPDATE filter_rules SET channel_id = ? WHERE id = ?").run(channel_id || null, id);
  const rule = db.prepare("SELECT fr.*, c.title AS channel_title FROM filter_rules fr LEFT JOIN channels c ON c.channel_id = fr.channel_id WHERE fr.id = ?").get(id);
  return c.json({ rule });
});

api.delete("/filter-rules/:id", (c) => {
  db.prepare("DELETE FROM filter_rules WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- image cache / proxy ----------

api.get("/img", async (c) => {
  const url = c.req.query("u");
  if (!url) return c.json({ error: "u required" }, 400);
  const img = await getCachedImage(url);
  // Nothing cached and origin failed: redirect so the browser can try directly.
  if (!img) return c.redirect(url, 302);
  return new Response(Bun.file(img.path), {
    headers: {
      "Content-Type": img.contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
});

// ---------- settings ----------

api.get("/settings", (c) => {
  const settings: Record<string, string> = {};
  for (const key of Object.keys(SETTING_DEFAULTS)) {
    settings[key] = getSetting(key) ?? SETTING_DEFAULTS[key];
  }
  return c.json({ settings });
});

api.put("/settings", async (c) => {
  const body = await c.req.json();
  for (const key of Object.keys(SETTING_DEFAULTS)) {
    if (key in body) setSetting(key, String(body[key]));
  }
  return c.json({ ok: true });
});

// ---------- refresh ----------

api.post("/refresh", async (c) => {
  const result = await refreshAll();
  return c.json(result);
});
