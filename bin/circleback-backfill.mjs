#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../lib/local-env.mjs";
import { processMeetings } from "../lib/meeting-store.mjs";

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
const result = processMeetings(meetings, brainRepo, { embed: process.env.GBRAIN_EMBED_ON_INGEST !== "false" });
for (const item of result.written) {
  console.log(`Wrote ${item.mdPath}`);
}

if (!result.ok) {
  console.error(result.gbrain.stderr || result.gbrain.stdout);
  process.exit(result.gbrain.status || 1);
}
if (result.gbrain.stderr) console.error(result.gbrain.stderr);
console.log(result.gbrain.stdout);
