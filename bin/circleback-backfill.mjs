#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../lib/local-env.mjs";
import { meetingToMarkdown } from "../lib/meeting-to-markdown.mjs";
import { syncBrain } from "../lib/gbrain.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
loadEnvFile(path.join(root, "config.env"));

const brainRepo = process.env.BRAIN_REPO || `${process.env.HOME}/brain`;
const lastDays = process.argv.includes("--last") ? process.argv[process.argv.indexOf("--last") + 1] : "30";
const search = process.argv.includes("--search") ? process.argv[process.argv.indexOf("--search") + 1] : "";

function runCircleback(args) {
  const result = spawnSync("circleback", args, {
    encoding: "utf8",
    env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}` },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `circleback ${args.join(" ")} failed`);
  }
  return JSON.parse(result.stdout);
}

function idsFromSearch(payload) {
  const rows = Array.isArray(payload) ? payload : payload.meetings || payload.results || payload.data || [];
  return rows.map((row) => row.id || row.linkId).filter(Boolean);
}

const searchArgs = ["--json", "meetings", "search"];
if (search) searchArgs.push(search);
searchArgs.push("--last", lastDays);

const ids = idsFromSearch(runCircleback(searchArgs));
if (!ids.length) {
  console.log(`No Circleback meetings found in the last ${lastDays} day(s).`);
  process.exit(0);
}

const details = runCircleback(["--json", "meetings", "read", ...ids.map(String)]);
const meetings = Array.isArray(details) ? details : details.meetings || details.results || details.data || [details];
const rawDir = path.join(brainRepo, "raw", "circleback");
fs.mkdirSync(rawDir, { recursive: true });

for (const meeting of meetings) {
  const { slug, markdown } = meetingToMarkdown(meeting);
  const mdPath = path.join(brainRepo, `${slug}.md`);
  const jsonPath = path.join(rawDir, `${path.basename(slug)}.json`);
  fs.mkdirSync(path.dirname(mdPath), { recursive: true });
  fs.writeFileSync(mdPath, markdown);
  fs.writeFileSync(jsonPath, `${JSON.stringify(meeting, null, 2)}\n`);
  console.log(`Wrote ${mdPath}`);
}

const sync = syncBrain(brainRepo, { embed: process.env.GBRAIN_EMBED_ON_INGEST !== "false" });
if (!sync.ok) {
  console.error(sync.stderr || sync.stdout);
  process.exit(sync.status || 1);
}
if (sync.stderr) console.error(sync.stderr);
console.log(sync.stdout);
