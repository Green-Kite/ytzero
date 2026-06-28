import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Edit3, Save, Trash2, X } from "lucide-react";
import { api, type UserPlaylist, type Video } from "../api";
import VideoCard from "../components/VideoCard";
import { VideoGridSkeleton } from "../components/LoadingState";
import { PlaylistIcon, PlaylistIconPicker } from "../components/PlaylistIcon";
import Popconfirm from "../components/Popconfirm";
import { emit } from "../events";
import { formatVideoCount, useI18n } from "../i18n";

export default function UserPlaylistPage({ onPlay }: { onPlay: (v: Video) => void }) {
  const { t, language } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const playlistId = Number(id);
  const [playlist, setPlaylist] = useState<UserPlaylist | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("ListMusic");

  const load = useCallback(async () => {
    if (!playlistId) return;
    setLoading(true);
    try {
      const r = await api.userPlaylist(playlistId);
      setPlaylist(r.playlist);
      setVideos(r.videos);
      setName(r.playlist.name);
      setIcon(r.playlist.icon);
    } finally {
      setLoading(false);
    }
  }, [playlistId]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const save = async () => {
    if (!playlist || !name.trim()) return;
    const r = await api.updateUserPlaylist(playlist.id, { name: name.trim(), icon });
    setPlaylist(r.playlist);
    setEditing(false);
  };

  const removePlaylist = async () => {
    if (!playlist) return;
    await api.deleteUserPlaylist(playlist.id);
    emit("playlists-changed");
    navigate("/");
  };

  if (!playlist && loading) return <VideoGridSkeleton gridSize="sm" />;
  if (!playlist) return null;

  return (
    <>
      <div className="playlist-header">
        <div className="playlist-title-wrap">
          {editing ? (
            <div className="playlist-edit-row">
              <PlaylistIconPicker value={icon} onChange={setIcon} />
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
              <button className="btn primary" onClick={save}>
                <Save /> {t("save")}
              </button>
              <button className="btn icon-only" title={t("cancel")} onClick={() => setEditing(false)}>
                <X />
              </button>
            </div>
          ) : (
            <>
              <div className="playlist-icon"><PlaylistIcon icon={playlist.icon} /></div>
              <div className="playlist-title-text">
                <h1 className="page-title">{playlist.name}</h1>
                <div className="muted">{formatVideoCount(playlist.video_count, language)}</div>
              </div>
              <button className="icon-btn playlist-title-edit" title={t("edit")} onClick={() => setEditing(true)}>
                <Edit3 />
              </button>
            </>
          )}
        </div>
        <div className="playlist-actions">
          <Popconfirm message={t("confirmDelete", { name: playlist.name })} onConfirm={removePlaylist}>
            <button className="btn danger">
              <Trash2 /> {t("deletePlaylist")}
            </button>
          </Popconfirm>
        </div>
      </div>

      {loading && videos.length === 0 ? (
        <VideoGridSkeleton gridSize="sm" />
      ) : videos.length === 0 ? (
        <div className="empty-state">{t("playlistIsEmpty")}</div>
      ) : (
        <div className="video-grid video-grid--sm">
          {videos.map((v) => (
            <VideoCard
              key={v.video_id}
              video={v}
              onPlay={onPlay}
              onChanged={load}
              onRemoveFromPlaylist={(videoId) => api.removeVideoFromUserPlaylist(playlist.id, videoId)}
            />
          ))}
        </div>
      )}
    </>
  );
}
