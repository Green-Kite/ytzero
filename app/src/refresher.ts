import { db } from "./db";
import { checkIsShort, fetchChannelAbout, fetchChannelFeed, fetchChannelVideos, fetchChannelVideosDurations, fetchLiveInfo } from "./youtube";
import { applyAutoTags } from "./autotags";
import { applyPlaylistRulesToVideo } from "./userPlaylists";
import { applyFilterRules } from "./filterRules";

const upsertVideo = db.prepare(`
  INSERT INTO videos (video_id, channel_id, title, description, thumbnail, published_at, views, likes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(video_id) DO UPDATE SET
    title = excluded.title,
    description = excluded.description,
    thumbnail = excluded.thumbnail,
    published_at = excluded.published_at,
    views = COALESCE(excluded.views, views),
    likes = COALESCE(excluded.likes, likes)
`);

const videoExists = db.prepare("SELECT 1 FROM videos WHERE video_id = ?");

export async function refreshChannel(channelId: string): Promise<{ added: number }> {
  const feed = await fetchChannelFeed(channelId);
  const inheritChannelTags = db.prepare(
    "INSERT OR IGNORE INTO video_tags (video_id, tag_id, source) SELECT ?, tag_id, 'channel' FROM channel_tags WHERE channel_id = ?"
  );

  let added = 0;
  for (const v of feed.videos) {
    const isNew = !videoExists.get(v.videoId);
    upsertVideo.run(v.videoId, channelId, v.title, v.description, v.thumbnail, v.publishedAt, v.views, v.likes);
    if (isNew) {
      applyAutoTags(v.videoId, v.title, v.description);
      applyFilterRules(v.videoId, channelId, v.title, v.description);
      applyPlaylistRulesToVideo(v.videoId);
      inheritChannelTags.run(v.videoId, channelId);
      added++;
    }
  }
  await backfillShorts(feed.videos.map((v) => v.videoId));

  const missingDuration = db.prepare(
    "SELECT 1 FROM videos WHERE channel_id = ? AND duration IS NULL AND live_status = 'none' LIMIT 1"
  ).get(channelId);
  if (missingDuration) {
    fetchChannelVideosDurations(channelId).then((durations) => {
      const upd = db.prepare("UPDATE videos SET duration = ? WHERE video_id = ? AND duration IS NULL");
      for (const d of durations) upd.run(d.duration, d.videoId);
    }).catch(() => {});
  }

  if (feed.channelTitle) {
    db.prepare(
      "UPDATE channels SET title = ?, last_refreshed_at = datetime('now') WHERE channel_id = ? AND title = ''"
    ).run(feed.channelTitle, channelId);
  }
  db.prepare("UPDATE channels SET last_refreshed_at = datetime('now') WHERE channel_id = ?").run(channelId);
  return { added };
}

/**
 * Resolve is_short for videos that haven't been checked yet (is_short IS NULL).
 * Limited per call to stay polite to YouTube; unknowns are treated as regular
 * videos until resolved.
 */
export async function backfillShorts(videoIds?: string[], limit = 50) {
  let rows: { video_id: string; title: string }[];
  if (videoIds && videoIds.length > 0) {
    const ph = videoIds.map(() => "?").join(",");
    rows = db
      .prepare(`SELECT video_id, title FROM videos WHERE is_short IS NULL AND video_id IN (${ph})`)
      .all(...videoIds) as any[];
  } else {
    rows = db
      .prepare("SELECT video_id, title FROM videos WHERE is_short IS NULL LIMIT ?")
      .all(limit) as any[];
  }
  const setShort = db.prepare("UPDATE videos SET is_short = ? WHERE video_id = ?");
  for (const r of rows) {
    const short = await checkIsShort(r.video_id, r.title);
    setShort.run(short ? 1 : 0, r.video_id);
    await Bun.sleep(120);
  }
}

export async function refreshLiveStatus(channelId: string) {
  const live = await fetchLiveInfo(channelId);

  // Anything previously live/upcoming on this channel that is no longer the
  // current livestream becomes was_live / none.
  db.prepare(
    `UPDATE videos SET live_status = CASE live_status WHEN 'live' THEN 'was_live' ELSE 'none' END
     WHERE channel_id = ? AND live_status IN ('live', 'upcoming') AND video_id != ?`
  ).run(channelId, live?.videoId ?? "");

  if (!live) return;
  const status = live.isLiveNow ? "live" : live.isUpcoming ? "upcoming" : "was_live";
  const existing = videoExists.get(live.videoId);
  if (existing) {
    db.prepare("UPDATE videos SET live_status = ? WHERE video_id = ?").run(status, live.videoId);
  } else {
    db.prepare(
      `INSERT INTO videos (video_id, channel_id, title, thumbnail, published_at, live_status)
       VALUES (?, ?, ?, ?, datetime('now'), ?)`
    ).run(live.videoId, channelId, live.title, live.thumbnail, status);
    applyAutoTags(live.videoId, live.title, "");
    applyPlaylistRulesToVideo(live.videoId);
  }
}

/**
 * Fetch the channel's /videos tab for more video IDs than the RSS feed provides (~30 vs 15).
 * Merges scraped data with RSS data (RSS has better quality: description + published_at).
 */
export async function syncChannel(channelId: string): Promise<{ added: number }> {
  const [feed, scraped] = await Promise.all([
    fetchChannelFeed(channelId).catch(() => ({ videos: [], channelTitle: "", channelId })),
    fetchChannelVideos(channelId),
  ]);

  const feedMap = new Map(feed.videos.map((v) => [v.videoId, v]));
  const insertOrUpdate = db.prepare(`
    INSERT INTO videos (video_id, channel_id, title, description, thumbnail, published_at, views, likes, duration)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(video_id) DO UPDATE SET
      title = excluded.title,
      thumbnail = excluded.thumbnail,
      views = COALESCE(excluded.views, views),
      duration = COALESCE(excluded.duration, duration)
  `);

  const inheritChannelTags = db.prepare(
    "INSERT OR IGNORE INTO video_tags (video_id, tag_id, source) SELECT ?, tag_id, 'channel' FROM channel_tags WHERE channel_id = ?"
  );

  let added = 0;
  const seen = new Set<string>();

  for (const v of scraped) {
    seen.add(v.videoId);
    const isNew = !videoExists.get(v.videoId);
    const rss = feedMap.get(v.videoId);
    insertOrUpdate.run(
      v.videoId, channelId,
      rss?.title ?? v.title,
      rss?.description ?? "",
      rss?.thumbnail ?? v.thumbnail,
      rss?.publishedAt ?? null,
      rss?.views ?? v.viewCount,
      rss?.likes ?? null,
      v.duration || null,
    );
    if (isNew) {
      applyAutoTags(v.videoId, rss?.title ?? v.title, rss?.description ?? "");
      applyFilterRules(v.videoId, channelId, rss?.title ?? v.title, rss?.description ?? "");
      applyPlaylistRulesToVideo(v.videoId);
      inheritChannelTags.run(v.videoId, channelId);
      added++;
    }
  }

  // Also add RSS-only videos (not in scraped list) to get description + published_at
  for (const v of feed.videos) {
    if (seen.has(v.videoId)) continue;
    const isNew = !videoExists.get(v.videoId);
    upsertVideo.run(v.videoId, channelId, v.title, v.description, v.thumbnail, v.publishedAt, v.views, v.likes);
    if (isNew) {
      applyAutoTags(v.videoId, v.title, v.description);
      applyFilterRules(v.videoId, channelId, v.title, v.description);
      applyPlaylistRulesToVideo(v.videoId);
      inheritChannelTags.run(v.videoId, channelId);
      added++;
    }
  }

  db.prepare("UPDATE channels SET last_refreshed_at = datetime('now') WHERE channel_id = ?").run(channelId);
  return { added };
}

/**
 * Fetch and save avatar + subscriber count for a small batch of channels,
 * prioritising those not checked recently. Called on a slow background timer.
 */
export async function refreshAvatarsBatch() {
  const rows = db
    .prepare(
      "SELECT channel_id FROM channels ORDER BY COALESCE(avatar_checked_at, '1970-01-01') ASC LIMIT 3"
    )
    .all() as { channel_id: string }[];

  const markChecked = db.prepare(
    "UPDATE channels SET avatar_checked_at = datetime('now') WHERE channel_id = ?"
  );
  const saveAvatar = db.prepare(
    "UPDATE channels SET thumbnail = ?, title = ?, subscriber_count = ?, avatar_checked_at = datetime('now') WHERE channel_id = ?"
  );

  for (let i = 0; i < rows.length; i++) {
    const { channel_id } = rows[i];
    try {
      const about = await fetchChannelAbout(channel_id);
      saveAvatar.run(about.avatar || null, about.title || null, about.stats[0] ?? null, channel_id);
    } catch {
      markChecked.run(channel_id);
    }
    if (i < rows.length - 1) await Bun.sleep(5_000);
  }
}

let refreshing = false;

export async function refreshAll(): Promise<{ channels: number; added: number; errors: string[] }> {
  if (refreshing) return { channels: 0, added: 0, errors: ["refresh already in progress"] };
  refreshing = true;
  try {
    const channels = db.prepare("SELECT channel_id FROM channels").all() as { channel_id: string }[];
    let added = 0;
    const errors: string[] = [];
    for (const { channel_id } of channels) {
      try {
        const r = await refreshChannel(channel_id);
        added += r.added;
        await refreshLiveStatus(channel_id);
      } catch (e) {
        errors.push(`${channel_id}: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Be polite to YouTube.
      await Bun.sleep(300);
    }
    // Resolve any remaining unchecked videos (e.g. rows from before the
    // shorts column existed).
    await backfillShorts();
    return { channels: channels.length, added, errors };
  } finally {
    refreshing = false;
  }
}

export function startScheduler() {
  const intervalMin = Number(process.env.REFRESH_INTERVAL_MINUTES ?? 15);
  setTimeout(() => refreshAll().catch(console.error), 3_000);
  setInterval(() => refreshAll().catch(console.error), intervalMin * 60_000);
  console.log(`[ytzero] feed refresh every ${intervalMin} min`);

  // Avatar cron: fetch 3 channels every 10 minutes, 5 s gap between each
  setTimeout(() => refreshAvatarsBatch().catch(console.error), 15_000);
  setInterval(() => refreshAvatarsBatch().catch(console.error), 10 * 60_000);
  console.log("[ytzero] avatar refresh every 10 min (3 channels/batch)");
}
