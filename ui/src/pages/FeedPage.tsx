import { useCallback, useEffect, useRef, useState } from "react";
import { subscribe } from "../events";
import { useSearchParams } from "react-router-dom";
import { Grid2X2, Grid3X3, Inbox, RefreshCw, Square } from "lucide-react";
import { api, type Bucket, type Tag, type Video } from "../api";
import { useI18n } from "../i18n";
import TagFilterBar from "../components/TagFilterBar";
import VideoCard, { BUCKET_ICONS } from "../components/VideoCard";
import { VideoGridSkeleton } from "../components/LoadingState";

type GridSize = "sm" | "md" | "lg";

const GRID_SIZES: { id: GridSize; icon: React.ReactNode; labelKey: "gridSmall" | "gridMedium" | "gridLarge" }[] = [
  { id: "sm", icon: <Grid3X3 size={15} />, labelKey: "gridSmall" },
  { id: "md", icon: <Grid2X2 size={15} />, labelKey: "gridMedium" },
  { id: "lg", icon: <Square size={15} />, labelKey: "gridLarge" },
];

function getTimeBucket(): Bucket | null {
  const now = new Date();
  const h = now.getHours();
  const day = now.getDay(); // 0=Sun, 5=Fri, 6=Sat
  if (day === 0 || day === 5 || day === 6) return "weekend";
  if (h >= 5 && h < 12) return "morning";
  if (h >= 17) return "evening";
  return "tomorrow";
}

export default function FeedPage({
  onPlay,
  showToast,
}: {
  onPlay: (v: Video) => void;
  showToast: (m: string) => void;
}) {
  const { t, bucketLabel, language } = useI18n();
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const [videos, setVideos] = useState<Video[]>([]);
  const [queued, setQueued] = useState<Video[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<number[]>(() => {
    try { return JSON.parse(sessionStorage.getItem("feedTags") ?? "[]"); } catch { return []; }
  });
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [gridSize, setGridSize] = useState<GridSize>(
    () => (localStorage.getItem("gridSize") as GridSize) ?? "sm"
  );
  const loadMoreRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setPage(0), [q]);

  const load = useCallback(async (requestedPage = page) => {
    if (requestedPage === 0) setLoading(true);
    else setLoadingMore(true);
    try {
      const feed = await api.feed({ tags: selectedTags, q, page: requestedPage });
      setVideos((prev) => (requestedPage === 0 ? feed.videos : [...prev, ...feed.videos]));
      setHasMore(feed.videos.length === 40);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [selectedTags, q, page]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const loadTags = useCallback(() => {
    api.tags().then((r) => setTags(r.tags)).catch(console.error);
  }, []);

  useEffect(() => {
    loadTags();
    api.watchlist().then((r) => setQueued(r.videos)).catch(console.error);
  }, [loadTags]);

  useEffect(() => subscribe("tags-changed", loadTags), [loadTags]);

  // Infinite scroll
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setPage((p) => p + 1); },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, videos]);

  const changeGridSize = (size: GridSize) => {
    setGridSize(size);
    localStorage.setItem("gridSize", size);
    api.updateSettings({ grid_size: size }).catch(() => {});
  };

  const toggleTag = (id: number) => {
    setLoading(true);
    setPage(0);
    setSelectedTags((s) => {
      const next = s.includes(id) ? s.filter((t) => t !== id) : [...s, id];
      sessionStorage.setItem("feedTags", JSON.stringify(next));
      return next;
    });
  };

  const clearTags = () => {
    setLoading(true);
    setPage(0);
    setSelectedTags([]);
    sessionStorage.removeItem("feedTags");
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await api.refresh();
      showToast(language === "pl" ? `Odświeżono ${r.channels} kanałów, ${r.added} nowych filmów` : `Refreshed ${r.channels} channels, ${r.added} new videos`);
      setLoading(true);
      setPage(0);
      await load(0);
    } catch (e) {
      showToast(`${t("refreshError")} ${e instanceof Error ? e.message : e}`);
    } finally {
      setRefreshing(false);
    }
  };

  const reload = () => {
    setLoading(true);
    setPage(0);
    load(0).catch(console.error);
  };

  // Time-based queued section — only show videos that have unlocked
  const timeBucket = getTimeBucket();
  const now = new Date();
  const sectionVideos = timeBucket
    ? queued.filter((v) => v.bucket === timeBucket && (!v.show_from || new Date(v.show_from) <= now))
    : [];

  return (
    <>
      <div className="toolbar">
        <TagFilterBar tags={tags} selected={selectedTags} onToggle={toggleTag} onClearAll={clearTags} />
        <div className="toolbar-right" style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div className="grid-size-toggle">
            {GRID_SIZES.map((g) => (
              <button
                key={g.id}
                className={`grid-size-btn${gridSize === g.id ? " active" : ""}`}
                title={t(g.labelKey)}
                onClick={() => changeGridSize(g.id)}
              >
                {g.icon}
              </button>
            ))}
          </div>
          <button className="btn icon-only" title={t("refresh")} onClick={refresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? "spin" : undefined} />
          </button>
        </div>
      </div>

      {q && (
        <p className="search-info">
          {t("searchResultsFor")} <b>{q}</b>
        </p>
      )}

      {sectionVideos.length > 0 && !q && selectedTags.length === 0 && (
        <div className="time-section">
          <div className="time-section-header">
            {timeBucket && (() => { const Icon = BUCKET_ICONS[timeBucket]; return <Icon size={16} />; })()}
            <span>{timeBucket ? bucketLabel(timeBucket) : ""}</span>
          </div>
          <div className={`video-grid video-grid--${gridSize}`}>
            {sectionVideos.map((v) => (
              <VideoCard key={v.video_id} video={v} onPlay={onPlay} onChanged={reload} />
            ))}
          </div>
          <div className="time-section-divider" />
        </div>
      )}

      {loading && videos.length === 0 ? (
        <VideoGridSkeleton gridSize={gridSize} />
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <Inbox />
          <div>
            {q
              ? t("noSearchResults")
              : t("noVideos")}
          </div>
        </div>
      ) : (
        <>
          <div className={`video-grid video-grid--${gridSize}`}>
            {videos.map((v) => (
              <VideoCard key={v.video_id} video={v} onPlay={onPlay} onChanged={reload} />
            ))}
          </div>
          {loadingMore && <VideoGridSkeleton count={4} gridSize={gridSize} />}
          {hasMore && !loadingMore && (
            <div className="load-more">
              <button ref={loadMoreRef} className="btn" onClick={() => setPage((p) => p + 1)}>
                {t("loadMore")}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
