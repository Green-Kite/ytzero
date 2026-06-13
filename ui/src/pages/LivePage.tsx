import { useCallback, useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { api, type Video } from "../api";
import { useI18n } from "../i18n";
import VideoCard from "../components/VideoCard";
import { VideoGridSkeleton } from "../components/LoadingState";

export default function LivePage({ onPlay }: { onPlay: (v: Video) => void }) {
  const { t } = useI18n();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api
      .live()
      .then((r) => setVideos(r.videos))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const live = videos.filter((v) => v.live_status === "live");
  const upcoming = videos.filter((v) => v.live_status !== "live");

  return (
    <>
      <h1 className="page-title">{t("navLive")}</h1>
      {loading && videos.length === 0 ? (
        <VideoGridSkeleton />
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <Radio />
          <div>{t("liveEmpty")}</div>
        </div>
      ) : (
        <>
          {live.length > 0 && (
            <>
              <div className="section-title">{t("liveNow")}</div>
              <div className="video-grid">
                {live.map((v) => (
                  <VideoCard key={v.video_id} video={v} onPlay={onPlay} onChanged={load} />
                ))}
              </div>
            </>
          )}
          {upcoming.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: live.length > 0 ? 32 : 0 }}>{t("upcoming")}</div>
              <div className="video-grid">
                {upcoming.map((v) => (
                  <VideoCard key={v.video_id} video={v} onPlay={onPlay} onChanged={load} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
