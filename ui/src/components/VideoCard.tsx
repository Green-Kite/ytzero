import {
  AlarmClock,
  Archive,
  Coffee,
  Eye,
  Moon,
  Sunrise,
  Trash2,
  Undo2,
} from "lucide-react";
import type { CSSProperties, MouseEvent, PointerEvent } from "react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDrag } from "@use-gesture/react";
import { api, type Bucket, type Video } from "../api";
import { compactNumber, formatTimeAgo, formatViewsCount, useI18n } from "../i18n";
import { img } from "../img";

export function compactViews(views: number | null): string {
  if (views == null) return "";
  return compactNumber(views, "en");
}

export function formatViews(views: number | null): string {
  if (views == null) return "";
  return formatViewsCount(views, "en");
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US");
}

export const BUCKET_ICONS: Record<Bucket, typeof Sunrise> = {
  morning: Sunrise,
  evening: Moon,
  tomorrow: AlarmClock,
  weekend: Coffee,
};

const BUCKET_ORDER: Bucket[] = ["morning", "evening", "tomorrow", "weekend"];
const SWIPE_THRESHOLD = 90;

export default function VideoCard({
  video,
  onPlay,
  onChanged,
  showRestore,
  showChannelAvatar = true,
  onRemoveFromPlaylist,
}: {
  video: Video;
  onPlay: (v: Video) => void;
  onChanged: () => void;
  showRestore?: boolean;
  showChannelAvatar?: boolean;
  onRemoveFromPlaylist?: (videoId: string) => Promise<unknown>;
}) {
  const { t, bucketLabel, language } = useI18n();
  const [fading, setFading] = useState(false);
  const [actionProximity, setActionProximity] = useState(0);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [committedDir, setCommittedDir] = useState<"left" | "right" | null>(null);
  const lastProximityRef = useRef(0);
  const blockNextThumbClickRef = useRef(false);

  const fade = (fn: () => Promise<unknown>) => {
    fn().then(() => { setFading(true); setTimeout(onChanged, 520); });
  };

  const act = (e: MouseEvent, fn: () => Promise<unknown>) => {
    e.stopPropagation();
    fade(fn);
  };

  const bind = useDrag(
    ({ active, movement: [mx], tap, cancel, last }) => {
      if (tap || video.status === "archived") return;

      if (active) {
        setSwiping(true);
        const clamped = Math.sign(mx) * Math.min(Math.abs(mx), 160);
        setSwipeX(clamped);
        // trigger early when well past threshold
        if (Math.abs(mx) > SWIPE_THRESHOLD * 1.8) {
          cancel();
          commitSwipe(mx);
        }
      }

      if (last) {
        setSwiping(false);
        commitSwipe(mx);
      }
    },
    {
      axis: "x",
      filterTaps: true,
      from: [0, 0],
      pointer: { capture: true },
    }
  );

  const commitSwipe = (mx: number) => {
    if (Math.abs(mx) >= SWIPE_THRESHOLD) {
      const dir = mx < 0 ? "left" : "right";
      setCommittedDir(dir);
      setSwipeX(0);
      setFading(true);
      const action = dir === "left"
        ? api.archiveVideo(video.video_id)
        : api.watch(video.video_id).then(() => api.archiveVideo(video.video_id));
      action.then(() => { setTimeout(onChanged, 620); });
    } else {
      setCommittedDir(null);
      setSwipeX(0);
    }
  };

  const getActionProximity = (rect: DOMRect, clientX: number, clientY: number) => {
    const targetX = rect.right - 24;
    const targetY = rect.top + 20;
    const distance = Math.hypot(clientX - targetX, clientY - targetY);
    const radius = Math.min(150, rect.width * 0.58);
    return Math.max(0, Math.min(1, 1 - distance / radius));
  };

  const updateActionProximity = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const next = getActionProximity(rect, e.clientX, e.clientY);
    if (Math.abs(next - lastProximityRef.current) < 0.025) return;
    lastProximityRef.current = next;
    setActionProximity(next);
    if (next > 0.52) setActionsOpen(true);
  };

  const openTouchActions = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const next = getActionProximity(rect, e.clientX, e.clientY);
    if (next < 0.35) return;
    blockNextThumbClickRef.current = true;
    lastProximityRef.current = 1;
    setActionProximity(1);
    setActionsOpen(true);
  };

  const resetActionProximity = () => {
    lastProximityRef.current = 0;
    setActionProximity(0);
    setActionsOpen(false);
  };

  const playFromThumb = (e: MouseEvent<HTMLDivElement>) => {
    if (blockNextThumbClickRef.current) {
      blockNextThumbClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onPlay(video);
  };

  const absX = Math.abs(swipeX);
  const revealProgress = Math.min(1, absX / SWIPE_THRESHOLD);
  const swipeDir = swipeX < -4 ? "left" : swipeX > 4 ? "right" : null;
  const activeSwipeDir = committedDir ?? swipeDir;

  const contentOpacity = Math.min(1, revealProgress * 2.5);
  const revealGap = swiping ? 10 : 0;
  const revealWidth = fading ? "100%" : Math.max(0, Math.min(absX, 160) - revealGap);

  const cardTransition = swiping
    ? "none"
    : fading
      ? "opacity 0.56s ease, transform 0.56s cubic-bezier(0.22, 1, 0.36, 1)"
      : "transform 0.5s cubic-bezier(0.34, 1.4, 0.64, 1)";

  const cardTilt = swiping ? `rotateZ(${Math.sign(swipeX) * Math.min(1.2, absX / 120)}deg)` : "";
  const cardFadeScale = fading ? "scale(0.97)" : "";

  return (
    <div className={`swipe-wrap${fading ? " card-fading" : ""}`}>
      {activeSwipeDir === "right" && (
        <div className="swipe-reveal swipe-reveal--left" style={{ width: revealWidth, opacity: fading ? undefined : contentOpacity }}>
          <span className="swipe-reveal-icon">
            <Eye size={22} />
          </span>
          <span className="swipe-reveal-label">{t("watched")}</span>
        </div>
      )}
      {activeSwipeDir === "left" && (
        <div className="swipe-reveal swipe-reveal--right" style={{ width: revealWidth, opacity: fading ? undefined : contentOpacity }}>
          <span className="swipe-reveal-icon">
            <Archive size={22} />
          </span>
          <span className="swipe-reveal-label">{t("reject")}</span>
        </div>
      )}

      <div
        {...bind()}
        className="video-card"
        style={{
          transform: `translateX(${swipeX}px) ${cardTilt} ${cardFadeScale}`,
          transition: cardTransition,
          touchAction: "pan-y",
          userSelect: "none",
          willChange: swiping ? "transform" : "auto",
        }}
      >
        <div
          className={`thumb-wrap${actionsOpen ? " controls-near" : ""}`}
          style={{ "--actions-proximity": actionProximity } as CSSProperties}
          onClick={playFromThumb}
          onPointerMove={updateActionProximity}
          onPointerDown={openTouchActions}
          onPointerLeave={resetActionProximity}
          onMouseLeave={resetActionProximity}
        >
          <img className="thumb" src={img(video.thumbnail)} alt="" loading="lazy" draggable={false} />
          {video.live_status === "live" && (
            <span className="live-badge">
              <span className="pulse" /> {t("liveBadge")}
            </span>
          )}
          {video.live_status === "upcoming" && <span className="live-badge upcoming">{t("upcomingBadge")}</span>}
          {video.is_short === 1 && video.live_status === "none" && <span className="short-badge">{t("shortBadge")}</span>}
          {video.duration && video.is_short !== 1 && (
            <span className="duration-badge">{video.duration}</span>
          )}
          {video.watch_position != null && video.watch_duration != null && video.watch_duration > 0 && video.status !== "archived" && (
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${Math.min(100, (video.watch_position / video.watch_duration) * 100)}%` }}
              />
            </div>
          )}

          <div className="thumb-actions-zone" onClick={(e) => e.stopPropagation()}>
            <div className="thumb-actions-peek" aria-hidden="true">
              <span /><span /><span /><span />
            </div>
            <div className="thumb-actions">
              <div className="thumb-actions-row schedule">
                {BUCKET_ORDER.map((b) => {
                  const Icon = BUCKET_ICONS[b];
                  const active = video.bucket === b;
                  return (
                    <button
                      key={b}
                      className={`action-btn${active ? " active" : ""}`}
                      title={active ? `${t("removeFrom")} ${bucketLabel(b)}` : bucketLabel(b)}
                      onClick={(e) => act(e, () => active ? api.dequeue(video.video_id) : api.queue(video.video_id, b))}
                    >
                      <Icon />
                      <span className="action-tip">{active ? t("remove") : bucketLabel(b)}</span>
                    </button>
                  );
                })}
                {video.status !== "archived" && (
                  <button className="action-btn" onClick={(e) => act(e, () => api.archiveVideo(video.video_id))}>
                    <Archive />
                    <span className="action-tip">{t("reject")}</span>
                  </button>
                )}
              </div>
              <div className="thumb-actions-row secondary">
                {video.status !== "archived" && (
                  <button className="action-btn" onClick={(e) => act(e, () => api.archiveVideo(video.video_id))}>
                    <Eye />
                    <span className="action-tip">{t("watched")}</span>
                  </button>
                )}
                {showRestore && (
                  <button className="action-btn" onClick={(e) => act(e, () => api.restore(video.video_id))}>
                    <Undo2 />
                    <span className="action-tip">{t("restore")}</span>
                  </button>
                )}
                {onRemoveFromPlaylist && (
                  <button className="action-btn" onClick={(e) => act(e, () => onRemoveFromPlaylist(video.video_id))}>
                    <Trash2 />
                    <span className="action-tip">{t("removeFromPlaylist")}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="card-body">
          {showChannelAvatar && (
            <Link to={`/channel/${video.channel_id}`} className="card-avatar-link">
              {video.channel_thumbnail ? (
                <img className="card-ch-avatar" src={img(video.channel_thumbnail)} alt="" draggable={false} />
              ) : (
                <div className="card-ch-avatar card-ch-avatar-fallback">
                  {video.channel_title.charAt(0).toUpperCase()}
                </div>
              )}
            </Link>
          )}
          <div className="card-info">
            <div className="v-title" onClick={() => onPlay(video)}>
              {video.title}
            </div>
            <div className="v-meta">
              <Link to={`/channel/${video.channel_id}`} className="channel-link">
                {video.channel_title}
              </Link>
              <span>·</span>
              <span>{formatTimeAgo(video.published_at, language)}</span>
              {video.bucket && <span className="bucket-label">{bucketLabel(video.bucket)}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
