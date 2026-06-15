import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import { api, type Video } from "../api";
import { useI18n } from "../i18n";
import VideoCard from "../components/VideoCard";
import { VideoGridSkeleton } from "../components/LoadingState";

export default function HistoryPage({ onPlay }: { onPlay: (v: Video) => void }) {
  const { t } = useI18n();
  const [videos, setVideos] = useState<Video[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback((requestedPage = page) => {
    if (requestedPage === 0) setLoading(true);
    else setLoadingMore(true);
    api
      .history(requestedPage)
      .then((r) => {
        setVideos((prev) => (requestedPage === 0 ? r.videos : [...prev, ...r.videos]));
        setHasMore(r.videos.length === 40);
      })
      .catch(console.error)
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  }, [page]);

  useEffect(load, [load]);

  return (
    <>
      <h1 className="page-title">{t("historyTitle")}</h1>
      {loading && videos.length === 0 ? (
        <VideoGridSkeleton />
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <History />
          <div>{t("historyEmpty")}</div>
        </div>
      ) : (
        <>
          <div className="video-grid">
            {videos.map((v) => (
              <VideoCard key={`${v.history_id ?? v.video_id}`} video={v} onPlay={onPlay} onChanged={() => { setPage(0); load(0); }} showWatchProgress />
            ))}
          </div>
          {loadingMore && <VideoGridSkeleton count={4} />}
          {hasMore && !loadingMore && (
            <div className="load-more">
              <button className="btn" onClick={() => setPage((p) => p + 1)}>
                {t("loadMore")}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
