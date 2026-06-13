import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Check, ExternalLink, ListVideo, Plus, RefreshCw, UserMinus, UserPlus, Video as VideoIcon, Zap } from "lucide-react";
import { api, type ChannelAbout, type PlaylistInfo, type Tag, type Video } from "../api";
import TagChip from "../components/TagChip";
import VideoCard from "../components/VideoCard";
import { img } from "../img";
import { emit } from "../events";
import { formatAddedVideos, formatVideoCount as formatI18nVideoCount, useI18n, type Language } from "../i18n";

type Tab = "videos" | "shorts" | "playlists";

function formatVideoCount(n: string | number, language: Language): string {
  const num = Number(String(n).replace(/\D/g, ""));
  if (!num) return String(n);
  return formatI18nVideoCount(num, language);
}

export default function ChannelPage({ onPlay }: { onPlay: (v: Video) => void }) {
  const { t, language } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) ?? "videos";
  const setTab = (t: Tab) => setSearchParams({ tab: t }, { replace: true });
  const [about, setAbout] = useState<ChannelAbout | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistInfo[] | null>(null);
  const [descOpen, setDescOpen] = useState(false);
  const [followed, setFollowed] = useState(true);
  const [unfollowPending, setUnfollowPending] = useState(false);
  const [channelTags, setChannelTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3ea6ff");
  const tagMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    setAbout(null);
    setPlaylists(null);
    setChannelTags([]);
    setSearchParams({ tab: "videos" }, { replace: true });
    setFollowed(true);
    window.scrollTo(0, 0);
    api.channelAbout(id).then((about) => { setAbout(about); emit("channels-changed"); }).catch(console.error);
    api.channel(id).then((r) => setChannelTags(r.channel.tags)).catch(console.error);
    api.feed({ channel: id, status: "all", shorts: true, limit: 200 }).then((r) => setVideos(r.videos)).catch(console.error);
    api.channelPlaylists(id).then((r) => setPlaylists(r.playlists)).catch(() => setPlaylists([]));
    api.tags().then((r) => setAllTags(r.tags)).catch(console.error);
  }, [id]);

  useEffect(() => {
    if (!tagMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (!tagMenuRef.current?.contains(e.target as Node)) setTagMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [tagMenuOpen]);

  const reload = () => {
    if (id) api.feed({ channel: id, status: "all", shorts: true, limit: 200 }).then((r) => setVideos(r.videos));
  };

  const toggleTag = async (tag: Tag) => {
    if (!id) return;
    const exists = channelTags.some((t) => t.id === tag.id);
    if (exists) {
      await api.untagChannel(id, tag.id);
      setChannelTags((prev) => prev.filter((t) => t.id !== tag.id));
      return;
    }
    await api.tagChannel(id, tag.id);
    setChannelTags((prev) => [...prev, tag]);
  };

  const createAndAddTag = async () => {
    if (!id || !newTagName.trim()) return;
    const r = await api.addTag(newTagName.trim(), newTagColor);
    setAllTags((prev) => [...prev, r.tag]);
    await api.tagChannel(id, r.tag.id);
    setChannelTags((prev) => [...prev, r.tag]);
    emit("tags-changed");
    setNewTagName("");
    setTagMenuOpen(false);
  };

  const removeTag = async (tag: Tag) => {
    if (!id) return;
    await api.untagChannel(id, tag.id);
    setChannelTags((prev) => prev.filter((t) => t.id !== tag.id));
  };

  const handleSync = async () => {
    if (!id || syncing) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await api.syncChannel(id);
      setSyncMsg(r.added > 0 ? formatAddedVideos(r.added, language) : t("noNewVideos"));
      if (r.added > 0) reload();
    } catch {
      setSyncMsg(t("syncError"));
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 4000);
    }
  };

  const toggleFollow = async () => {
    if (!id) return;
    setUnfollowPending(true);
    try {
      const next = !followed;
      await api.followChannel(id, next);
      setFollowed(next);
    } finally {
      setUnfollowPending(false);
    }
  };

  const regularVideos = videos.filter((v) => v.is_short !== 1);
  const shorts = videos.filter((v) => v.is_short === 1);

  return (
    <>
      {about?.banner && <img className="channel-banner" src={img(about.banner)} alt="" />}
      <div className="channel-header">
        {about?.avatar && <img className="channel-avatar" src={img(about.avatar)} alt="" />}
        <div className="channel-info">
          <h1 className="channel-title">{about?.title ?? "…"}</h1>
          {about && about.stats.length > 0 && <div className="channel-stats">{about.stats.join(" · ")}</div>}
          {about?.description && (
            <div
              className={`channel-desc${descOpen ? "" : " clamped"}`}
              onClick={() => setDescOpen((o) => !o)}
              title={descOpen ? t("collapse") : t("expand")}
            >
              {about.description}
            </div>
          )}
        </div>
        <div className="channel-header-actions">
          <button
            className="btn"
            onClick={handleSync}
            disabled={syncing}
            title={t("syncTitle")}
          >
            <RefreshCw size={15} className={syncing ? "spin" : ""} />
            {syncing ? t("syncing") : syncMsg ?? t("syncChannel")}
          </button>
          <button
            className={`btn${followed ? " danger" : " primary"}`}
            onClick={toggleFollow}
            disabled={unfollowPending}
            title={followed ? t("unfollow") : t("followAgain")}
          >
            {followed ? <UserMinus size={15} /> : <UserPlus size={15} />}
            {followed ? t("unfollow") : t("follow")}
          </button>
          <a className="btn" href={`https://www.youtube.com/channel/${id}`} target="_blank" rel="noreferrer">
            <ExternalLink /> YouTube
          </a>
        </div>
      </div>

      {/* Channel tag management */}
      <div className="channel-tags-row">
        <div className="dropdown" ref={tagMenuRef}>
          <button className="btn-ghost" onClick={() => setTagMenuOpen((o) => !o)} title={t("addTag")}>
            <Plus size={13} /> Tag
          </button>
          {tagMenuOpen && (
            <div className="dropdown-menu" style={{ minWidth: 220 }}>
              {allTags
                .map((tag) => {
                  const isSelected = channelTags.some((ct) => ct.id === tag.id);
                  return (
                    <button
                      key={tag.id}
                      className={isSelected ? "is-selected" : undefined}
                      onClick={() => toggleTag(tag)}
                      title={isSelected ? t("removeTagFromChannel") : t("tagToChannel")}
                    >
                      <span className="dot" style={{ background: tag.color, width: 8, height: 8, borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
                      {tag.name}
                      {isSelected && (
                        <span className="dropdown-menu-status" aria-label={t("selectedTag")}>
                          <Check size={14} />
                        </span>
                      )}
                    </button>
                  );
                })}
              <div style={{ borderTop: "1px solid var(--surface-3)", margin: "6px 0" }} />
              <div style={{ padding: "6px 12px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" }}>{t("newTag")}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    style={{ width: 32, height: 32, border: "1px solid var(--surface-3)", borderRadius: 6, background: "var(--bg)", padding: 2, cursor: "pointer", flexShrink: 0 }}
                  />
                  <input
                    type="text"
                    placeholder={t("tagNamePlaceholder")}
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createAndAddTag()}
                    style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--surface-3)", borderRadius: 6, padding: "6px 10px", color: "var(--text)", fontSize: 13, outline: "none", minWidth: 0 }}
                  />
                </div>
                <button
                  className="btn primary"
                  onClick={createAndAddTag}
                  disabled={!newTagName.trim()}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {t("addTag")}
                </button>
              </div>
            </div>
          )}
        </div>
        {channelTags.map((t) => (
          <TagChip key={t.id} tag={t} onRemove={() => removeTag(t)} />
        ))}
      </div>

      <div className="chip-bar" style={{ marginBottom: 22 }}>
        <button className={`chip${tab === "videos" ? " active" : ""}`} onClick={() => setTab("videos")}>
          <VideoIcon style={{ width: 15, height: 15 }} /> {t("videos")}
          {regularVideos.length > 0 && <span className="chip-count">{regularVideos.length}</span>}
        </button>
        {shorts.length > 0 && (
          <button className={`chip${tab === "shorts" ? " active" : ""}`} onClick={() => setTab("shorts")}>
            <Zap style={{ width: 15, height: 15 }} /> Shorts
            <span className="chip-count">{shorts.length}</span>
          </button>
        )}
        <button className={`chip${tab === "playlists" ? " active" : ""}`} onClick={() => setTab("playlists")}>
          <ListVideo style={{ width: 15, height: 15 }} /> {t("playlists")}{" "}
          {playlists ? `(${playlists.length})` : ""}
        </button>
      </div>

      {tab === "videos" &&
        (regularVideos.length === 0 ? (
          <div className="empty-state">{t("channelVideosEmpty")}</div>
        ) : (
          <div className="video-grid">
            {regularVideos.map((v) => (
              <VideoCard key={v.video_id} video={v} onPlay={onPlay} onChanged={reload} showChannelAvatar={false} />
            ))}
          </div>
        ))}

      {tab === "shorts" && (
        <div className="video-grid">
          {shorts.map((v) => (
            <VideoCard key={v.video_id} video={v} onPlay={onPlay} onChanged={reload} showChannelAvatar={false} />
          ))}
        </div>
      )}

      {tab === "playlists" &&
        (playlists === null ? (
          <div className="empty-state">{t("loading")}</div>
        ) : playlists.length === 0 ? (
          <div className="empty-state">{t("publicPlaylistsEmpty")}</div>
        ) : (
          <div className="video-grid">
            {playlists.map((p) => (
              <Link key={p.playlistId} to={`/playlist/${p.playlistId}`} className="video-card playlist-card">
                <div className="thumb-wrap">
                  {p.thumbnail ? (
                    <img className="thumb" src={img(p.thumbnail)} alt="" loading="lazy" />
                  ) : (
                    <div className="thumb" />
                  )}
                  {p.videoCount && (
                    <span className="playlist-count">{formatVideoCount(p.videoCount, language)}</span>
                  )}
                </div>
                <div className="card-body" style={{ flexDirection: "column", gap: 3 }}>
                  <div className="v-title">{p.title}</div>
                </div>
              </Link>
            ))}
          </div>
        ))}
    </>
  );
}
