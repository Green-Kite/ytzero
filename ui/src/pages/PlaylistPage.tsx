import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ExternalLink, Play } from "lucide-react";
import { api, type PlaylistVideo } from "../api";
import { useI18n } from "../i18n";
import { img } from "../img";
import { PlaylistItemsSkeleton } from "../components/LoadingState";

export default function PlaylistPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .playlistVideos(id)
      .then((r) => setVideos(r.videos))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (!id) return null;

  const activeVideo = videos[activeIndex];
  const autoplayParam = autoplay ? 1 : 0;

  const playerSrc = activeVideo
    ? `https://www.youtube-nocookie.com/embed/${activeVideo.videoId}?list=${id}&index=${activeIndex + 1}&autoplay=${autoplayParam}&rel=0`
    : `https://www.youtube-nocookie.com/embed/videoseries?list=${id}&autoplay=${autoplayParam}&rel=0`;

  return (
    <div className="playlist-layout">
      <div className="playlist-player-col">
        <iframe
          ref={iframeRef}
          key={playerSrc}
          className="watch-player"
          src={playerSrc}
          title={t("playlist")}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
        <div className="watch-row" style={{ marginTop: 12 }}>
          <span className="watch-title" style={{ margin: 0, marginRight: "auto", fontSize: 15 }}>
            {activeVideo?.title ?? t("playlist")}
          </span>
          <label className="autoplay-toggle">
            <input
              type="checkbox"
              checked={autoplay}
              onChange={(e) => setAutoplay(e.target.checked)}
            />
            {t("autoplay")}
          </label>
          <a
            className="btn"
            href={`https://www.youtube.com/playlist?list=${id}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink /> YouTube
          </a>
        </div>
      </div>

      <div className="playlist-sidebar">
        {loading ? (
          <PlaylistItemsSkeleton />
        ) : videos.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>{t("playlistEmpty")}</div>
        ) : (
          <div className="playlist-items">
            {videos.map((v, i) => (
              <button
                key={v.videoId}
                className={`playlist-item${i === activeIndex ? " active" : ""}`}
                onClick={() => setActiveIndex(i)}
              >
                <span className="playlist-item-num">{i + 1}</span>
                <div className="playlist-item-thumb">
                  <img src={img(v.thumbnail)} alt="" loading="lazy" />
                  {v.duration && <span className="playlist-item-dur">{v.duration}</span>}
                  {i === activeIndex && (
                    <span className="playlist-item-playing">
                      <Play size={12} fill="currentColor" />
                    </span>
                  )}
                </div>
                <div className="playlist-item-info">
                  <div className="playlist-item-title">{v.title}</div>
                  {v.channelTitle && <div className="playlist-item-ch">{v.channelTitle}</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
