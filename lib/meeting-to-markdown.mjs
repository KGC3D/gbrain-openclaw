import crypto from "node:crypto";

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}

export function meetingDate(meeting) {
  const raw = meeting.createdAt || meeting.startTime || meeting.startedAt || meeting.date || new Date().toISOString();
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function meetingSlug(meeting) {
  const date = meetingDate(meeting).toISOString().slice(0, 10);
  const id = meeting.id || meeting.linkId || crypto.createHash("sha1").update(JSON.stringify(meeting)).digest("hex").slice(0, 10);
  return `meetings/circleback/${date}-${slugify(meeting.name || meeting.title)}-${id}`;
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function yamlList(values) {
  const clean = (values || []).filter(Boolean).map((v) => String(v));
  if (!clean.length) return "[]";
  return `\n${clean.map((v) => `  - ${yamlString(v)}`).join("\n")}`;
}

function formatAttendee(attendee) {
  const name = attendee?.name || attendee?.displayName || attendee?.email || "Unknown";
  const email = attendee?.email ? ` <${attendee.email}>` : "";
  return `- ${name}${email}`;
}

function formatActionItem(item) {
  const assignee = item?.assignee?.name || item?.assignee?.email || "Unassigned";
  const status = item?.status || "PENDING";
  const description = item?.description ? `\n  ${item.description.replace(/\n/g, "\n  ")}` : "";
  return `- [${status === "DONE" ? "x" : " "}] ${item?.title || "Untitled action item"} (${assignee}, Circleback #${item?.id || "n/a"})${description}`;
}

function formatTranscript(transcript) {
  if (!Array.isArray(transcript) || transcript.length === 0) return "_No transcript included._";
  return transcript
    .map((segment) => {
      const seconds = Number(segment.timestamp || 0);
      const minutes = Math.floor(seconds / 60);
      const remain = Math.floor(seconds % 60).toString().padStart(2, "0");
      return `- [${minutes}:${remain}] **${segment.speaker || "Speaker"}:** ${segment.text || ""}`;
    })
    .join("\n");
}

function formatInsights(insights) {
  if (!insights || typeof insights !== "object" || Array.isArray(insights)) return "_No insights included._";
  const sections = [];
  for (const [name, entries] of Object.entries(insights)) {
    const rows = Array.isArray(entries) ? entries : [];
    const body = rows.length
      ? rows.map((entry) => {
          const value = typeof entry.insight === "string" ? entry.insight : JSON.stringify(entry.insight, null, 2);
          const speaker = entry.speaker ? ` (${entry.speaker})` : "";
          return `- ${value}${speaker}`;
        }).join("\n")
      : "_None._";
    sections.push(`### ${name}\n${body}`);
  }
  return sections.join("\n\n") || "_No insights included._";
}

export function meetingToMarkdown(meeting) {
  const date = meetingDate(meeting);
  const slug = meetingSlug(meeting);
  const title = meeting.name || meeting.title || "Untitled Circleback meeting";
  const attendees = Array.isArray(meeting.attendees) ? meeting.attendees : [];
  const tags = Array.isArray(meeting.tags) ? meeting.tags : [];
  const actionItems = Array.isArray(meeting.actionItems) ? meeting.actionItems : [];
  const circlebackUrl = meeting.id ? `https://app.circleback.ai/meetings/${meeting.id}` : "";

  const frontmatter = [
    "---",
    `title: ${yamlString(title)}`,
    "type: meeting",
    "source: circleback",
    `circleback_id: ${yamlString(meeting.id || meeting.linkId || "")}`,
    `date: ${yamlString(date.toISOString())}`,
    `tags:${yamlList(["circleback", "meeting", ...tags])}`,
    `attendees:${yamlList(attendees.map((a) => a.email || a.name).filter(Boolean))}`,
    `url: ${yamlString(circlebackUrl)}`,
    "---",
    "",
  ].join("\n");

  const body = [
    `# ${title}`,
    "",
    `Source: [Circleback](${circlebackUrl || "https://app.circleback.ai"})`,
    `Recorded: ${date.toISOString()}`,
    meeting.duration ? `Duration: ${Math.round(Number(meeting.duration) / 60)} minutes` : "",
    meeting.url ? `Meeting URL: ${meeting.url}` : "",
    "",
    "## Attendees",
    attendees.length ? attendees.map(formatAttendee).join("\n") : "_No attendees included._",
    "",
    "## Notes",
    meeting.notes || "_No notes included._",
    "",
    "## Action Items",
    actionItems.length ? actionItems.map(formatActionItem).join("\n") : "_No action items included._",
    "",
    "## Insights",
    formatInsights(meeting.insights),
    "",
    "## Transcript",
    formatTranscript(meeting.transcript),
    "",
  ].filter((line) => line !== "").join("\n");

  return { slug, markdown: frontmatter + body };
}
