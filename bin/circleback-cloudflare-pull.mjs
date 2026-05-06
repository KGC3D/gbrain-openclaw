#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../lib/local-env.mjs";
import { inboxItemId, normalizeInboxItems, processMeetings, unwrapMeeting } from "../lib/meeting-store.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
loadEnvFile(path.join(root, "config.env"));

const brainRepo = process.env.BRAIN_REPO || `${process.env.HOME}/brain`;
const workerBaseUrl = (process.env.CIRCLEBACK_WORKER_URL || "").replace(/\/+$/, "");
const pullSecret = process.env.CONTROL_ROOM_PULL_SECRET || process.env.CIRCLEBACK_WORKER_PULL_SECRET || "";
const pendingPath = process.env.CIRCLEBACK_WORKER_PENDING_PATH || "/api/inbox/pending";
const ackPath = process.env.CIRCLEBACK_WORKER_ACK_PATH || "/api/inbox/ack";
const embed = process.env.GBRAIN_EMBED_ON_INGEST !== "false";

if (!workerBaseUrl) {
  console.log("CIRCLEBACK_WORKER_URL is not set; skipping Cloudflare inbox pull.");
  process.exit(0);
}

if (!pullSecret) {
  console.log("CONTROL_ROOM_PULL_SECRET is not set; skipping Cloudflare inbox pull.");
  process.exit(0);
}

function authHeaders(extra = {}) {
  return {
    authorization: `Bearer ${pullSecret}`,
    "content-type": "application/json",
    ...extra,
  };
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Expected JSON from ${response.url}, got: ${text.slice(0, 300)}`);
  }
}

async function main() {
  const pendingResponse = await fetch(`${workerBaseUrl}${pendingPath}`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!pendingResponse.ok) {
    const body = await pendingResponse.text();
    throw new Error(`Worker pending pull failed: ${pendingResponse.status} ${body}`);
  }

  const pendingPayload = await readJson(pendingResponse);
  const items = normalizeInboxItems(pendingPayload);
  if (!items.length) {
    console.log("No pending Circleback meetings in Worker inbox.");
    return;
  }

  const meetings = [];
  const ackIds = [];
  for (const item of items) {
    const meeting = unwrapMeeting(item);
    const id = inboxItemId(item, meeting);
    if (!id) {
      console.warn("Skipping inbox item without an ack id.");
      continue;
    }
    meetings.push(meeting);
    ackIds.push(id);
  }

  const result = processMeetings(meetings, brainRepo, { embed });
  for (const item of result.written) {
    console.log(`Wrote ${item.mdPath}`);
  }

  if (!result.ok) {
    throw new Error(result.gbrain.stderr || result.gbrain.stdout || "GBrain sync failed; not acking Worker inbox.");
  }

  const ackResponse = await fetch(`${workerBaseUrl}${ackPath}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ ids: ackIds, keys: ackIds, processedAt: new Date().toISOString() }),
  });

  if (!ackResponse.ok) {
    const body = await ackResponse.text();
    throw new Error(`Worker ack failed: ${ackResponse.status} ${body}`);
  }

  if (result.gbrain.stderr) console.error(result.gbrain.stderr);
  console.log(`Acked ${ackIds.length} Circleback inbox item(s).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
