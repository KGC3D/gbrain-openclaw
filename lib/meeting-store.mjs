import fs from "node:fs";
import path from "node:path";
import { meetingToMarkdown } from "./meeting-to-markdown.mjs";
import { syncBrain } from "./gbrain.mjs";

export function normalizeInboxItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.meetings)) return payload.meetings;
  if (Array.isArray(payload?.pending)) return payload.pending;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export function unwrapMeeting(item) {
  return item?.meeting || item?.payload || item?.body || item?.data || item;
}

export function inboxItemId(item, meeting) {
  return item?.key || item?.inboxKey || item?.id || item?.kvKey || meeting?.id || meeting?.linkId;
}

export function writeMeetingToBrain(meeting, brainRepo) {
  const { slug, markdown } = meetingToMarkdown(meeting);
  const rawDir = path.join(brainRepo, "raw", "circleback");
  const mdPath = path.join(brainRepo, `${slug}.md`);
  const jsonPath = path.join(rawDir, `${path.basename(slug)}.json`);

  fs.mkdirSync(path.dirname(mdPath), { recursive: true });
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(mdPath, markdown);
  fs.writeFileSync(jsonPath, `${JSON.stringify(meeting, null, 2)}\n`);

  return { slug, mdPath, jsonPath };
}

export function processMeetings(meetings, brainRepo, { embed = true } = {}) {
  const written = [];
  for (const meeting of meetings) {
    written.push(writeMeetingToBrain(meeting, brainRepo));
  }

  if (!written.length) {
    return { ok: true, written, gbrain: { stdout: "", stderr: "" } };
  }

  const sync = syncBrain(brainRepo, { embed });
  return { ok: sync.ok, written, gbrain: sync };
}
