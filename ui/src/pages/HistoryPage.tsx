import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import { api, type Video } from "../api";
import { useI18n } from "../i18n";
import VideoCard from "../components/VideoCard";

export default function HistoryPage({ onPlay }: { onPlay: (v: Video) => void }) {
  const { t } = useI18n();
  const [videos, setVideos] = useState<Video[]>([]);
  const [page, setPage] = useState(0);

  const load = useCallback(() => {
    api
      .history(page)
      .then((r) => setVideos((prev) => (page === 0 ? r.videos : [...prev, ...r.videos])))
      .catch(console.error);
  }, [page]);

  useEffect(load, [load]);

  return (
    <>
      <h1 className="page-title">{t("historyTitle")}</h1>
      {videos.length === 0 ? (
        <div className="empty-state">
          <History />
          <div>{t("historyEmpty")}</div>
        </div>
      ) : (
        <>
          <div className="video-grid">
            {videos.map((v) => (
              <VideoCard key={`${v.history_id ?? v.video_id}`} video={v} onPlay={onPlay} onChanged={() => setPage(0)} />
            ))}
          </div>
          <div className="load-more">
            <button className="btn" onClick={() => setPage((p) => p + 1)}>
              {t("loadMore")}
            </button>
          </div>
        </>
      )}
    </>
  );
}
