import { useCallback, useEffect, useRef, useState } from "react";
import { Inbox } from "lucide-react";
import { subscribe } from "../events";
import { api, type Tag, type Video } from "../api";
import { useI18n } from "../i18n";
import TagFilterBar from "../components/TagFilterBar";
import VideoCard from "../components/VideoCard";
import ShortsPlayer from "../components/ShortsPlayer";
import { VideoGridSkeleton } from "../components/LoadingState";

export default function ShortsPage() {
  const { t } = useI18n();
  const [videos, setVideos] = useState<Video[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<number[]>(() => {
    try { return JSON.parse(sessionStorage.getItem("shortsTags") ?? "[]"); } catch { return []; }
  });
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [playerIdx, setPlayerIdx] = useState<number | null>(null);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async (requestedPage: number) => {
    if (requestedPage === 0) setLoading(true);
    else { setLoadingMore(true); loadingMoreRef.current = true; }
    try {
      const feed = await api.feed({ shorts: true, only_shorts: true, tags: selectedTags, page: requestedPage });
      setVideos((prev) => (requestedPage === 0 ? feed.videos : [...prev, ...feed.videos]));
      const more = feed.videos.length === 40;
      setHasMore(more);
      hasMoreRef.current = more;
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [selectedTags]);

  useEffect(() => { load(0).catch(console.error); }, [load]);

  const loadTags = useCallback(() => {
    api.tags().then((r) => setTags(r.tags)).catch(console.error);
  }, []);

  useEffect(loadTags, [loadTags]);
  useEffect(() => subscribe("tags-changed", loadTags), [loadTags]);

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

  useEffect(() => {
    if (page === 0) return;
    load(page).catch(console.error);
  }, [page, load]);

  const toggleTag = (id: number) => {
    setLoading(true);
    setPage(0);
    setSelectedTags((s) => {
      const next = s.includes(id) ? s.filter((t) => t !== id) : [...s, id];
      sessionStorage.setItem("shortsTags", JSON.stringify(next));
      return next;
    });
  };

  const clearTags = () => {
    setLoading(true);
    setPage(0);
    setSelectedTags([]);
    sessionStorage.removeItem("shortsTags");
  };

  const reload = useCallback(() => {
    setPage(0);
    load(0).catch(console.error);
  }, [load]);

  const loadMore = useCallback(() => {
    if (!hasMoreRef.current || loadingMoreRef.current) return;
    loadingMoreRef.current = true; // guard against rapid calls before state updates
    setPage((p) => p + 1);
  }, []);

  const openPlayer = useCallback((v: Video) => {
    const idx = videos.findIndex((x) => x.video_id === v.video_id);
    setPlayerIdx(idx >= 0 ? idx : 0);
  }, [videos]);

  const handleWatched = useCallback((videoId: string) => {
    setWatchedIds((prev) => {
      if (prev.has(videoId)) return prev;
      const next = new Set(prev);
      next.add(videoId);
      return next;
    });
  }, []);

  return (
    <>
      {playerIdx !== null && (
        <ShortsPlayer
          videos={videos}
          initialIndex={playerIdx}
          onClose={() => setPlayerIdx(null)}
          onLoadMore={loadMore}
          onWatched={handleWatched}
        />
      )}

      <h1 className="page-title">{t("navShorts")}</h1>

      <TagFilterBar tags={tags} selected={selectedTags} onToggle={toggleTag} onClearAll={clearTags} />

      {loading && videos.length === 0 ? (
        <VideoGridSkeleton gridSize="sm" />
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <Inbox />
          <div>{t("noVideos")}</div>
        </div>
      ) : (
        <>
          <div className="video-grid video-grid--sm">
            {videos.map((v) => (
              <VideoCard
                key={v.video_id}
                video={v}
                onPlay={openPlayer}
                onChanged={reload}
                isWatched={v.in_history === 1 || watchedIds.has(v.video_id)}
              />
            ))}
          </div>
          {loadingMore && <VideoGridSkeleton count={4} gridSize="sm" />}
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
