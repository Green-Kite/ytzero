import { useCallback, useEffect, useRef, useState } from "react";
import { Inbox } from "lucide-react";
import { api, type Video } from "../api";
import { useI18n } from "../i18n";
import VideoCard from "../components/VideoCard";
import { VideoGridSkeleton } from "../components/LoadingState";

type GridSize = "sm" | "md" | "lg";

export default function ShortsPage({ onPlay }: { onPlay: (v: Video) => void }) {
  const { t } = useI18n();
  const [videos, setVideos] = useState<Video[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const gridSize: GridSize = "sm";
  const loadMoreRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (requestedPage = page) => {
    if (requestedPage === 0) setLoading(true);
    else setLoadingMore(true);
    try {
      const feed = await api.feed({ shorts: true, only_shorts: true, page: requestedPage });
      setVideos((prev) => (requestedPage === 0 ? feed.videos : [...prev, ...feed.videos]));
      setHasMore(feed.videos.length === 40);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [page]);

  useEffect(() => { load().catch(console.error); }, [load]);

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

  const reload = () => {
    setLoading(true);
    setPage(0);
    load(0).catch(console.error);
  };

  return (
    <>
      <h1 className="page-title">{t("navShorts")}</h1>
      {loading && videos.length === 0 ? (
        <VideoGridSkeleton gridSize={gridSize} />
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <Inbox />
          <div>{t("noVideos")}</div>
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
