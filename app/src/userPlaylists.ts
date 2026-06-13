import { db } from "./db";

export interface UserPlaylistRule {
  id: number;
  playlist_id: number;
  pattern: string;
  match_type: "contains" | "regex";
  field: "title" | "description" | "both";
}

interface VideoForRules {
  video_id: string;
  title: string;
  description: string;
}

function ruleMatches(rule: UserPlaylistRule, title: string, description: string): boolean {
  const haystacks: string[] = [];
  if (rule.field === "title" || rule.field === "both") haystacks.push(title);
  if (rule.field === "description" || rule.field === "both") haystacks.push(description);
  if (rule.match_type === "regex") {
    try {
      const re = new RegExp(rule.pattern, "i");
      return haystacks.some((h) => re.test(h));
    } catch {
      return false;
    }
  }
  const needle = rule.pattern.toLowerCase();
  return haystacks.some((h) => h.toLowerCase().includes(needle));
}

const insertPlaylistVideo = db.prepare(
  "INSERT OR IGNORE INTO user_playlist_videos (playlist_id, video_id) VALUES (?, ?)"
);

export function applyPlaylistRulesToVideo(videoId: string): number {
  const video = db.prepare("SELECT video_id, title, description FROM videos WHERE video_id = ?").get(videoId) as VideoForRules | null;
  if (!video) return 0;
  const rules = db.prepare("SELECT * FROM user_playlist_rules").all() as UserPlaylistRule[];
  let count = 0;
  for (const rule of rules) {
    if (ruleMatches(rule, video.title, video.description)) {
      insertPlaylistVideo.run(rule.playlist_id, video.video_id);
      count++;
    }
  }
  return count;
}

export function applyPlaylistRulesToVideos(videoIds: string[]) {
  for (const videoId of videoIds) applyPlaylistRulesToVideo(videoId);
}

export function applyPlaylistRuleToAllVideos(ruleId: number): number {
  const rule = db.prepare("SELECT * FROM user_playlist_rules WHERE id = ?").get(ruleId) as UserPlaylistRule | null;
  if (!rule) return 0;
  const videos = db.prepare("SELECT video_id, title, description FROM videos").all() as VideoForRules[];
  let count = 0;
  for (const video of videos) {
    if (ruleMatches(rule, video.title, video.description)) {
      insertPlaylistVideo.run(rule.playlist_id, video.video_id);
      count++;
    }
  }
  return count;
}

export function applyPlaylistRulesForPlaylist(playlistId: number): number {
  const rules = db.prepare("SELECT * FROM user_playlist_rules WHERE playlist_id = ?").all(playlistId) as UserPlaylistRule[];
  const videos = db.prepare("SELECT video_id, title, description FROM videos").all() as VideoForRules[];
  let count = 0;
  for (const video of videos) {
    if (rules.some((rule) => ruleMatches(rule, video.title, video.description))) {
      insertPlaylistVideo.run(playlistId, video.video_id);
      count++;
    }
  }
  return count;
}
