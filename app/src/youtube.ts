import { XMLParser } from "fast-xml-parser";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Cookie: "CONSENT=YES+cb.20240101-00-p0.en+FX+100; SOCS=CAI",
};

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export interface FeedVideo {
  videoId: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  views: number | null;
  likes: number | null;
}

export interface ChannelFeed {
  channelId: string;
  channelTitle: string;
  videos: FeedVideo[];
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export async function fetchChannelFeed(channelId: string): Promise<ChannelFeed> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`RSS fetch failed (${res.status}) for ${channelId}`);
  const doc = xml.parse(await res.text());
  const feed = doc.feed ?? {};
  const videos: FeedVideo[] = asArray(feed.entry).map((e: any) => {
    const community = e["media:group"]?.["media:community"];
    const views = Number(community?.["media:statistics"]?.["@_views"]);
    const likes = Number(community?.["media:starRating"]?.["@_count"]);
    return {
      videoId: e["yt:videoId"] ?? "",
      title: String(e.title ?? ""),
      description: String(e["media:group"]?.["media:description"] ?? ""),
      thumbnail:
        e["media:group"]?.["media:thumbnail"]?.["@_url"] ??
        `https://i.ytimg.com/vi/${e["yt:videoId"]}/hqdefault.jpg`,
      publishedAt: e.published ?? "",
      views: Number.isFinite(views) ? views : null,
      likes: Number.isFinite(likes) ? likes : null,
    };
  });
  return {
    channelId,
    channelTitle: String(feed.title ?? ""),
    videos: videos.filter((v) => v.videoId),
  };
}

/** Resolve any YouTube channel URL or @handle to a channel ID (UC...). */
export async function resolveChannelId(input: string): Promise<{ channelId: string; title: string; thumbnail: string }> {
  let url = input.trim();
  if (/^UC[\w-]{22}$/.test(url)) {
    url = `https://www.youtube.com/channel/${url}`;
  } else if (url.startsWith("@")) {
    url = `https://www.youtube.com/${url}`;
  } else if (!/^https?:\/\//.test(url)) {
    url = `https://www.youtube.com/${url.replace(/^\/+/, "")}`;
  }
  const res = await fetch(url, { headers: FETCH_HEADERS, redirect: "follow" });
  if (!res.ok) throw new Error(`Nie udało się pobrać strony kanału (${res.status})`);
  const html = await res.text();
  // The canonical link is authoritative; "channelId" occurrences in page data
  // can belong to recommended channels.
  const idMatch =
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) ??
    html.match(/"channelId":"(UC[\w-]{22})"/);
  if (!idMatch) throw new Error("Nie znaleziono channel ID na stronie");
  const titleMatch = html.match(/<meta property="og:title" content="([^"]*)"/);
  const thumbMatch = html.match(/<meta property="og:image" content="([^"]*)"/);
  return {
    channelId: idMatch[1],
    title: titleMatch?.[1] ?? "",
    thumbnail: thumbMatch?.[1] ?? "",
  };
}

export interface LiveInfo {
  videoId: string;
  title: string;
  thumbnail: string;
  isLiveNow: boolean;
  isUpcoming: boolean;
}

/**
 * Scrape https://www.youtube.com/channel/<id>/live to detect a current or
 * upcoming livestream. Returns null when the channel is not live.
 */
export async function fetchLiveInfo(channelId: string): Promise<LiveInfo | null> {
  const res = await fetch(`https://www.youtube.com/channel/${channelId}/live`, {
    headers: FETCH_HEADERS,
    redirect: "follow",
  });
  if (!res.ok) return null;
  const html = await res.text();

  // When the channel has a live/upcoming stream, /live canonicalizes to the
  // watch page; otherwise it canonicalizes back to the channel page.
  const videoIdMatch = html.match(
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/
  );
  if (!videoIdMatch) return null;

  // "isLive":true is set only while the stream is actually broadcasting;
  // ended streams keep "isLiveContent":true but drop "isLive".
  const isUpcoming = /"isUpcoming"\s*:\s*true/.test(html);
  const isLiveNow = !isUpcoming && /"isLive"\s*:\s*true/.test(html);
  if (!isLiveNow && !isUpcoming) return null;

  const titleMatch = html.match(/<meta name="title" content="([^"]*)"/);
  return {
    videoId: videoIdMatch[1],
    title: titleMatch?.[1] ?? "",
    thumbnail: `https://i.ytimg.com/vi/${videoIdMatch[1]}/hqdefault.jpg`,
    isLiveNow,
    isUpcoming: !isLiveNow && isUpcoming,
  };
}

/** Extract the ytInitialData JSON blob embedded in a YouTube page. */
function extractInitialData(html: string): any | null {
  const marker = "ytInitialData = ";
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const end = html.indexOf(";</script>", start);
  if (end < 0) return null;
  try {
    return JSON.parse(html.slice(start + marker.length, end));
  } catch {
    return null;
  }
}

/** Collect every value stored under the given key anywhere in a JSON tree. */
function deepCollect(node: any, key: string, out: any[] = []): any[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) deepCollect(item, key, out);
    return out;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === key) out.push(v);
    deepCollect(v, key, out);
  }
  return out;
}

export interface ChannelAbout {
  channelId: string;
  title: string;
  description: string;
  avatar: string;
  banner: string;
  stats: string[];
}

const aboutCache = new Map<string, { at: number; data: ChannelAbout }>();
const ABOUT_TTL = 10 * 60_000;

export async function fetchChannelAbout(channelId: string): Promise<ChannelAbout> {
  const cached = aboutCache.get(channelId);
  if (cached && Date.now() - cached.at < ABOUT_TTL) return cached.data;

  const res = await fetch(`https://www.youtube.com/channel/${channelId}`, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`channel page fetch failed (${res.status})`);
  const html = await res.text();
  const data = extractInitialData(html);
  const meta = data?.metadata?.channelMetadataRenderer ?? {};

  // Banner lives in the (frequently restructured) header; try both layouts.
  const bannerSources =
    deepCollect(data?.header, "imageBannerViewModel")[0]?.image?.sources ??
    data?.header?.c4TabbedHeaderRenderer?.banner?.thumbnails ??
    [];
  const banner = bannerSources.at(-1)?.url ?? "";

  // Subscriber / video counts: gather the short metadata texts from the header.
  const stats: string[] = [];
  for (const parts of deepCollect(data?.header, "metadataParts")) {
    for (const p of Array.isArray(parts) ? parts : []) {
      const t = p?.text?.content;
      if (typeof t === "string" && t.length < 40) stats.push(t);
    }
  }
  const subLegacy = data?.header?.c4TabbedHeaderRenderer?.subscriberCountText?.simpleText;
  if (subLegacy) stats.push(subLegacy);

  const about: ChannelAbout = {
    channelId,
    title: meta.title ?? "",
    description: meta.description ?? "",
    avatar: meta.avatar?.thumbnails?.at(-1)?.url ?? "",
    banner,
    stats: [...new Set(stats)],
  };
  aboutCache.set(channelId, { at: Date.now(), data: about });
  return about;
}

export interface PlaylistInfo {
  playlistId: string;
  title: string;
  thumbnail: string;
  videoCount: string;
}

const playlistCache = new Map<string, { at: number; data: PlaylistInfo[] }>();

export async function fetchChannelPlaylists(channelId: string): Promise<PlaylistInfo[]> {
  const cached = playlistCache.get(channelId);
  if (cached && Date.now() - cached.at < ABOUT_TTL) return cached.data;

  const res = await fetch(`https://www.youtube.com/channel/${channelId}/playlists`, {
    headers: FETCH_HEADERS,
  });
  if (!res.ok) throw new Error(`playlists fetch failed (${res.status})`);
  const data = extractInitialData(await res.text());
  const out: PlaylistInfo[] = [];
  const seen = new Set<string>();

  // Legacy markup.
  for (const r of deepCollect(data, "gridPlaylistRenderer")) {
    if (!r?.playlistId || seen.has(r.playlistId)) continue;
    seen.add(r.playlistId);
    out.push({
      playlistId: r.playlistId,
      title: r.title?.runs?.[0]?.text ?? r.title?.simpleText ?? "",
      thumbnail: r.thumbnail?.thumbnails?.at(-1)?.url ?? "",
      videoCount: r.videoCountShortText?.simpleText ?? "",
    });
  }
  // Current markup (lockup view models).
  for (const vm of deepCollect(data, "lockupViewModel")) {
    const id = vm?.contentId;
    if (!id || seen.has(id) || !String(vm?.contentType ?? "").includes("PLAYLIST")) continue;
    seen.add(id);
    const badges = deepCollect(vm, "thumbnailBadgeViewModel")
      .map((b: any) => b?.text)
      .filter((t: any) => typeof t === "string");
    out.push({
      playlistId: id,
      title: vm?.metadata?.lockupMetadataViewModel?.title?.content ?? "",
      thumbnail: deepCollect(vm, "sources")[0]?.[0]?.url ?? "",
      videoCount: badges[0] ?? "",
    });
  }
  playlistCache.set(channelId, { at: Date.now(), data: out });
  return out;
}

export interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  duration: string;
  index: number;
}

const playlistVideoCache = new Map<string, { at: number; data: PlaylistVideo[] }>();

export interface VideoDuration { videoId: string; duration: string; }

export async function fetchChannelVideosDurations(channelId: string): Promise<VideoDuration[]> {
  const res = await fetch(`https://www.youtube.com/channel/${channelId}/videos`, { headers: FETCH_HEADERS });
  if (!res.ok) return [];
  const data = extractInitialData(await res.text());
  const out: VideoDuration[] = [];
  for (const r of deepCollect(data, "videoRenderer")) {
    if (r?.videoId && r?.lengthText?.simpleText) {
      out.push({ videoId: r.videoId, duration: r.lengthText.simpleText });
    }
  }
  return out;
}

export async function fetchPlaylistVideos(playlistId: string): Promise<PlaylistVideo[]> {
  const cached = playlistVideoCache.get(playlistId);
  if (cached && Date.now() - cached.at < ABOUT_TTL) return cached.data;

  const res = await fetch(`https://www.youtube.com/playlist?list=${playlistId}`, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`playlist fetch failed (${res.status})`);
  const data = extractInitialData(await res.text());
  const out: PlaylistVideo[] = [];

  for (const r of deepCollect(data, "playlistVideoRenderer")) {
    if (!r?.videoId) continue;
    out.push({
      videoId: r.videoId,
      title: r.title?.runs?.[0]?.text ?? r.title?.simpleText ?? "",
      thumbnail: r.thumbnail?.thumbnails?.at(-1)?.url ?? `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`,
      channelTitle: r.shortBylineText?.runs?.[0]?.text ?? "",
      duration: r.lengthText?.simpleText ?? "",
      index: Number(r.index?.simpleText ?? out.length),
    });
  }

  playlistVideoCache.set(playlistId, { at: Date.now(), data: out });
  return out;
}

export interface ScrapedVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  duration: string;
  viewCount: number | null;
}

/**
 * Scrape the channel's /videos tab to get more video IDs than the RSS feed.
 * Returns up to ~30 recent videos with basic metadata (no description/published_at).
 */
export async function fetchChannelVideos(channelId: string): Promise<ScrapedVideo[]> {
  const res = await fetch(`https://www.youtube.com/channel/${channelId}/videos`, { headers: FETCH_HEADERS });
  if (!res.ok) return [];
  const data = extractInitialData(await res.text());
  const out: ScrapedVideo[] = [];
  for (const r of deepCollect(data, "videoRenderer")) {
    if (!r?.videoId) continue;
    const viewStr =
      r?.viewCountText?.simpleText ?? r?.viewCountText?.runs?.[0]?.text ?? "";
    const viewNum = parseInt(viewStr.replace(/\D/g, ""), 10);
    out.push({
      videoId: r.videoId,
      title: r.title?.runs?.[0]?.text ?? r.title?.simpleText ?? "",
      thumbnail:
        r.thumbnail?.thumbnails?.at(-1)?.url ??
        `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`,
      duration: r.lengthText?.simpleText ?? "",
      viewCount: Number.isFinite(viewNum) && viewNum > 0 ? viewNum : null,
    });
  }
  return out;
}

/**
 * Detect whether a video is a YouTube Short. /shorts/<id> responds 200 for
 * Shorts and redirects (303) to /watch for regular videos.
 */
export async function checkIsShort(videoId: string, title: string): Promise<boolean> {
  if (/#shorts?\b/i.test(title)) return true;
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
      method: "HEAD",
      redirect: "manual",
      headers: FETCH_HEADERS,
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

/** Parse an OPML export (e.g. from NewPipe/FreeTube) into channel IDs. */
export function parseOpml(content: string): { channelId: string; title: string }[] {
  const doc = xml.parse(content);
  const result: { channelId: string; title: string }[] = [];
  const walk = (node: any) => {
    for (const outline of asArray<any>(node?.outline)) {
      const xmlUrl: string = outline["@_xmlUrl"] ?? "";
      const m = xmlUrl.match(/channel_id=(UC[\w-]{22})/);
      if (m) result.push({ channelId: m[1], title: outline["@_title"] ?? outline["@_text"] ?? "" });
      walk(outline);
    }
  };
  walk(doc?.opml?.body ?? {});
  return result;
}

/** Parse a Google Takeout subscriptions.csv (Channel Id, Channel Url, Channel Title). */
export function parseTakeoutCsv(content: string): { channelId: string; title: string }[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const result: { channelId: string; title: string }[] = [];
  for (const line of lines) {
    const m = line.match(/(UC[\w-]{22})/);
    if (!m) continue;
    // Title is the last CSV column; tolerate commas elsewhere.
    const cols = line.split(",");
    result.push({ channelId: m[1], title: cols.length >= 3 ? cols.slice(2).join(",").trim() : "" });
  }
  return result;
}
