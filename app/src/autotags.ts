import { db } from "./db";

interface Rule {
  id: number;
  tag_id: number;
  pattern: string;
  match_type: "contains" | "regex";
  field: "title" | "description" | "both";
}

function ruleMatches(rule: Rule, title: string, description: string): boolean {
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

const insertAutoTag = db.prepare(
  "INSERT OR IGNORE INTO video_tags (video_id, tag_id, source) VALUES (?, ?, 'auto')"
);

/** Apply all auto-tag rules to a single video. */
export function applyAutoTags(videoId: string, title: string, description: string) {
  const rules = db.prepare("SELECT * FROM auto_tag_rules").all() as Rule[];
  for (const rule of rules) {
    if (ruleMatches(rule, title, description)) insertAutoTag.run(videoId, rule.tag_id);
  }
}

/** Re-run a single rule against the whole library (used after creating/editing a rule). */
export function applyRuleToAllVideos(ruleId: number): number {
  const rule = db.prepare("SELECT * FROM auto_tag_rules WHERE id = ?").get(ruleId) as Rule | null;
  if (!rule) return 0;
  const videos = db.prepare("SELECT video_id, title, description FROM videos").all() as {
    video_id: string;
    title: string;
    description: string;
  }[];
  let count = 0;
  for (const v of videos) {
    if (ruleMatches(rule, v.title, v.description)) {
      insertAutoTag.run(v.video_id, rule.tag_id);
      count++;
    }
  }
  return count;
}
