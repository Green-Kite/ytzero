import { useCallback, useEffect, useState } from "react";
import { Archive } from "lucide-react";
import { api, type Video } from "../api";
import { useI18n } from "../i18n";
import VideoCard from "../components/VideoCard";

export default function ArchivePage({ onPlay }: { onPlay: (v: Video) => void }) {
  const { t } = useI18n();
  const [videos, setVideos] = useState<Video[]>([]);
  const [showShorts, setShowShorts] = useState(true);

  const load = useCallback(() => {
    api.archive().then((r) => setVideos(r.videos)).catch(console.error);
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    api.settings().then((r) => setShowShorts(r.settings.show_shorts === "1")).catch(console.error);
  }, []);

  const visible = showShorts ? videos : videos.filter((v) => v.is_short !== 1);

  return (
    <>
      <h1 className="page-title">{t("navArchive")}</h1>
      {visible.length === 0 ? (
        <div className="empty-state">
          <Archive />
          <div>{t("archiveEmpty")}</div>
        </div>
      ) : (
        <div className="video-grid">
          {visible.map((v) => (
            <VideoCard key={v.video_id} video={v} onPlay={onPlay} onChanged={load} showRestore />
          ))}
        </div>
      )}
    </>
  );
}
