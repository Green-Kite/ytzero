import { useCallback, useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import { api, type Bucket, type Video } from "../api";
import { emit } from "../events";
import { type Language, bucketLabels, useI18n } from "../i18n";
import VideoCard, { BUCKET_ICONS } from "../components/VideoCard";
import { VideoGridSkeleton } from "../components/LoadingState";

const BUCKET_ORDER: Bucket[] = ["today", "tonight", "tomorrow", "weekend"];

function formatShowFrom(showFrom: string, language: Language): string {
  const d = new Date(showFrom);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);
  const targetStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const locale = language === "pl" ? "pl-PL" : "en-US";
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  if (targetStart.getTime() === todayStart.getTime()) return language === "pl" ? `dziś o ${time}` : `today at ${time}`;
  if (targetStart.getTime() === tomorrowStart.getTime()) return language === "pl" ? `jutro o ${time}` : `tomorrow at ${time}`;

  const weekday = d.toLocaleDateString(locale, { weekday: "long" });
  const date = d.toLocaleDateString(locale, { day: "numeric", month: "short" });
  return language === "pl" ? `${weekday}, ${date} o ${time}` : `${weekday}, ${date} at ${time}`;
}

export default function WatchlistPage({ onPlay }: { onPlay: (v: Video) => void }) {
  const { t, bucketLabel, language } = useI18n();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api
      .watchlist()
      .then((r) => setVideos(r.videos))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const now = new Date();
  const due = videos.filter((v) => !v.show_from || new Date(v.show_from) <= now);
  const upcoming = videos
    .filter((v) => v.show_from && new Date(v.show_from) > now)
    .sort((a, b) => new Date(a.show_from!).getTime() - new Date(b.show_from!).getTime());

  const dueBuckets = BUCKET_ORDER.map((b) => ({
    bucket: b,
    items: due.filter((v) => v.bucket === b),
  })).filter((s) => s.items.length > 0);

  return (
    <>
      <h1 className="page-title">{t("navWatchlist")}</h1>
      {loading && videos.length === 0 ? (
        <VideoGridSkeleton />
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <Clock />
          <div>{t("watchlistEmpty")}</div>
        </div>
      ) : (
        <>
          {dueBuckets.map(({ bucket, items }) => {
            const Icon = BUCKET_ICONS[bucket];
            return (
              <section key={bucket} className="bucket-section">
                <h2 className="bucket-title">
                  <Icon /> {bucketLabel(bucket)} <span className="count">{items.length}</span>
                </h2>
                <div className="video-grid">
                  {items.map((v) => (
                    <VideoCard key={v.video_id} video={v} onPlay={onPlay} onChanged={load} showRestore />
                  ))}
                </div>
              </section>
            );
          })}

          {BUCKET_ORDER.map((b) => {
            const items = upcoming.filter((v) => v.bucket === b);
            if (items.length === 0) return null;
            const Icon = BUCKET_ICONS[b];
            return (
              <section key={`upcoming-${b}`} className="bucket-section">
                <h2 className="bucket-title">
                  <Icon /> {bucketLabel(b)} <span className="count">{items.length}</span>
                </h2>
                <table className="list-table">
                  <tbody>
                    {items.map((v) => (
                      <tr key={v.video_id}>
                        <td className="shrink">
                          <img src={v.thumbnail} alt="" className="scheduled-thumb" onClick={() => onPlay(v)} />
                        </td>
                        <td>
                          <div className="scheduled-title">{v.title}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{v.channel_title}</div>
                        </td>
                        <td className="shrink">
                          <div className="muted scheduled-date">
                            {v.show_from ? formatShowFrom(v.show_from, language) : ""}
                          </div>
                        </td>
                        <td className="shrink">
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            {BUCKET_ORDER.map((bucket) => {
                              const Icon = BUCKET_ICONS[bucket];
                              const active = v.bucket === bucket;
                              return (
                                <button
                                  key={bucket}
                                  className={`icon-btn${active ? " active" : ""}`}
                                  title={active ? bucketLabels[language][bucket] : `${t("moveTo")} ${bucketLabels[language][bucket]}`}
                                  style={active ? { color: "var(--accent)" } : undefined}
                                  onClick={() => api.queue(v.video_id, bucket).then(() => { emit("queue-changed"); load(); })}
                                >
                                  <Icon size={15} />
                                </button>
                              );
                            })}
                            <button className="icon-btn" title={t("removeFromQueue")} onClick={() => api.dequeue(v.video_id).then(() => { emit("queue-changed"); load(); })}><X size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
