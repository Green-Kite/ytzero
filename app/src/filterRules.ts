import { db } from "./db";

interface FilterRule {
  id: number;
  pattern: string;
  match_type: "contains" | "regex";
  field: "title" | "description" | "both";
  action: "reject" | "whitelist";
  channel_id: string | null;
}

function matches(rule: FilterRule, title: string, description: string): boolean {
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

const archiveVideo = db.prepare(
  "UPDATE videos SET status = 'archived' WHERE video_id = ? AND status = 'inbox'"
);

/** Apply all filter rules to a single new video. */
export function applyFilterRules(videoId: string, channelId: string, title: string, description: string) {
  const rules = db.prepare("SELECT * FROM filter_rules WHERE channel_id IS NULL OR channel_id = ?").all(channelId) as FilterRule[];
  for (const rule of rules) {
    if (rule.action === "reject" && matches(rule, title, description)) {
      archiveVideo.run(videoId);
      return;
    }
    if (rule.action === "whitelist" && !matches(rule, title, description)) {
      archiveVideo.run(videoId);
      return;
    }
  }
}

/** Apply a single rule to all existing inbox videos. Returns count of archived. */
export function applyFilterRuleToAll(ruleId: number): number {
  const rule = db.prepare("SELECT * FROM filter_rules WHERE id = ?").get(ruleId) as FilterRule | null;
  if (!rule) return 0;

  const where = rule.channel_id ? "status = 'inbox' AND channel_id = ?" : "status = 'inbox'";
  const args = rule.channel_id ? [rule.channel_id] : [];
  const videos = db.prepare(`SELECT video_id, channel_id, title, description FROM videos WHERE ${where}`).all(...args) as {
    video_id: string; channel_id: string; title: string; description: string;
  }[];

  let count = 0;
  for (const v of videos) {
    const hit = matches(rule, v.title, v.description);
    const shouldArchive = rule.action === "reject" ? hit : !hit;
    if (shouldArchive) {
      archiveVideo.run(v.video_id);
      count++;
    }
  }
  return count;
}
