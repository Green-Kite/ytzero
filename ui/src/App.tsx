import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { subscribe, emit } from "./events";
import { Link, NavLink, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { Archive, Clock, History, Home, Menu, Play, Plus, Radio, Search, Settings } from "lucide-react";
import { api, type UserPlaylist, type Video } from "./api";
import { img } from "./img";
import FeedPage from "./pages/FeedPage";
import LivePage from "./pages/LivePage";
import WatchlistPage from "./pages/WatchlistPage";
import HistoryPage from "./pages/HistoryPage";
import ArchivePage from "./pages/ArchivePage";
import SettingsPage from "./pages/SettingsPage";
import WatchPage from "./pages/WatchPage";
import ChannelPage from "./pages/ChannelPage";
import PlaylistPage from "./pages/PlaylistPage";
import UserPlaylistPage from "./pages/UserPlaylistPage";
import { PlaylistIcon, PlaylistIconPicker } from "./components/PlaylistIcon";
import { useI18n } from "./i18n";

const NAV = [
  { to: "/", labelKey: "navToday", icon: Home, end: true },
  { to: "/live", labelKey: "navLive", icon: Radio },
  { to: "/watchlist", labelKey: "navWatchlist", icon: Clock },
  { to: "/history", labelKey: "navHistory", icon: History },
  { to: "/archive", labelKey: "navArchive", icon: Archive },
  { to: "/settings", labelKey: "navSettings", icon: Settings },
] as const;

type RecentChannel = { channel_id: string; title: string; thumbnail: string; latest_thumbnail: string | null; latest_video_id: string | null };

function SidebarSubscriptions() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<RecentChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const [shadowTop, setShadowTop] = useState(false);
  const [shadowBot, setShadowBot] = useState(false);

  const loadChannels = useCallback(() => {
    api.recentChannels().then((r) => { setChannels(r.channels); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(loadChannels, [loadChannels]);
  useEffect(() => subscribe("channels-changed", loadChannels), [loadChannels]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    setShadowTop(el.scrollTop > 4);
    setShadowBot(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [channels]);

  return (
    <div className="sidebar-subs">
      <div className="sidebar-subs-header">{t("subscriptions")}</div>
      <div className={`sidebar-subs-scroll-wrap${shadowTop ? " shadow-top" : ""}${shadowBot ? " shadow-bot" : ""}`}>
        <div className="sidebar-subs-list" ref={listRef}>
          {loading && <div className="sidebar-subs-empty">{t("loading")}</div>}
          {channels.map((ch) => (
            <Link key={ch.channel_id} to={`/channel/${ch.channel_id}`} className="sidebar-sub-item">
              {ch.thumbnail ? (
                <img className="sidebar-sub-avatar" src={img(ch.thumbnail)} alt="" />
              ) : (
                <div className="sidebar-sub-avatar" />
              )}
              <span className="sidebar-sub-name">{ch.title}</span>
              {ch.latest_thumbnail && ch.latest_video_id && (
                <img
                  className="sidebar-sub-thumb"
                  src={img(ch.latest_thumbnail)}
                  alt=""
                  onClick={(e) => { e.preventDefault(); navigate(`/watch/${ch.latest_video_id}`); }}
                />
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function SidebarPlaylists() {
  const { t } = useI18n();
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("ListMusic");

  const load = useCallback(() => {
    api.userPlaylists().then((r) => setPlaylists(r.playlists)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribe("playlists-changed", load), [load]);

  const create = async () => {
    if (!name.trim()) return;
    await api.createUserPlaylist({ name: name.trim(), icon });
    setName("");
    setIcon("ListMusic");
    setCreating(false);
    load();
    emit("playlists-changed");
  };

  return (
    <div className="sidebar-playlists">
      <div className="sidebar-section-title">
        <span>{t("myPlaylists")}</span>
        <button className="sidebar-add-btn" title={t("newPlaylist")} onClick={() => setCreating((v) => !v)}>
          <Plus size={15} />
        </button>
      </div>
      {playlists.map((p) => (
        <NavLink key={p.id} to={`/playlists/${p.id}`} className={({ isActive }) => `sidebar-playlist-item${isActive ? " active" : ""}`}>
          <span className="sidebar-playlist-icon"><PlaylistIcon icon={p.icon} /></span>
          <span className="sidebar-sub-name">{p.name}</span>
          <span className="sidebar-playlist-count">{p.video_count}</span>
        </NavLink>
      ))}
      {creating && (
        <div className="sidebar-playlist-form">
          <div className="sidebar-playlist-fields">
            <PlaylistIconPicker value={icon} onChange={setIcon} compact />
            <input value={name} placeholder={t("playlistName")} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
          </div>
          <button className="btn primary" onClick={create} disabled={!name.trim()}>{t("create")}</button>
        </div>
      )}
    </div>
  );
}

function TopBar() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  useEffect(() => setQ(params.get("q") ?? ""), [params]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : "/");
  };

  return (
    <div className="topbar">
      <button
        className="sidebar-toggle-btn"
        aria-label="Menu"
        onClick={() => {
          const hidden = document.body.classList.toggle("sidebar-hidden");
          localStorage.setItem(SIDEBAR_KEY, hidden ? "0" : "1");
        }}
      >
        <Menu size={20} />
      </button>
      <Link to="/" className="topbar-logo">
        <span className="logo-mark">
          <Play fill="currentColor" />
        </span>
        <span className="logo-text">YouTube Zero</span>
      </Link>
      <form className="search-wrap" onSubmit={submit}>
        <input
          placeholder={t("searchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="search-btn" aria-label={t("search")}>
          <Search />
        </button>
      </form>
    </div>
  );
}

const SIDEBAR_KEY = "sidebar_open";

export default function App() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [liveCount, setLiveCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const play = useCallback((v: Video) => navigate(`/watch/${v.video_id}`), [navigate]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    if (saved === "0") document.body.classList.add("sidebar-hidden");
  }, []);

  useEffect(() => {
    const load = () =>
      api
        .live()
        .then((r) => setLiveCount(r.videos.filter((v) => v.live_status === "live").length))
        .catch(() => {});
    load();
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="layout">
      <TopBar />
      <div className="layout-body">
        <aside className="sidebar">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={"end" in item ? item.end : undefined} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              {(() => {
                const Icon = item.icon;
                return <Icon />;
              })()}
              <span className="nav-label">{t(item.labelKey)}</span>
              {item.to === "/live" && liveCount > 0 && <span className="badge">{liveCount}</span>}
            </NavLink>
          ))}
          <SidebarSubscriptions />
          <SidebarPlaylists />
        </aside>
        <main className="main">
          <div className="content">
            <Routes>
              <Route path="/" element={<FeedPage onPlay={play} showToast={showToast} />} />
              <Route path="/live" element={<LivePage onPlay={play} />} />
              <Route path="/watch/:id" element={<WatchPage />} />
              <Route path="/channel/:id" element={<ChannelPage onPlay={play} />} />
              <Route path="/playlist/:id" element={<PlaylistPage />} />
              <Route path="/playlists/:id" element={<UserPlaylistPage onPlay={play} />} />
              <Route path="/watchlist" element={<WatchlistPage onPlay={play} />} />
              <Route path="/history" element={<HistoryPage onPlay={play} />} />
              <Route path="/archive" element={<ArchivePage onPlay={play} />} />
              <Route path="/settings" element={<SettingsPage showToast={showToast} />} />
            </Routes>
          </div>
        </main>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
