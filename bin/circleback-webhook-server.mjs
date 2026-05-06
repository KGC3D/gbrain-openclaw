#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../lib/local-env.mjs";
import { meetingSlug, meetingToMarkdown } from "../lib/meeting-to-markdown.mjs";
import { syncBrain } from "../lib/gbrain.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
loadEnvFile(path.join(root, "config.env"));

const port = Number(process.env.CIRCLEBACK_GBRAIN_PORT || 3137);
const brainRepo = process.env.BRAIN_REPO || `${process.env.HOME}/brain`;
const signingSecret = process.env.CIRCLEBACK_WEBHOOK_SECRET || "";
const requireSignature = process.env.CIRCLEBACK_REQUIRE_SIGNATURE !== "false";
const rawDir = path.join(brainRepo, "raw", "circleback");

function verifySignature(rawBody, signature) {
  if (!signingSecret) return !requireSignature;
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", signingSecret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
}

function send(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function handleWebhook(req, res) {
  const rawBody = await readBody(req);
  const signature = req.headers["x-signature"];
  if (!verifySignature(rawBody, signature)) {
    return send(res, 401, { ok: false, error: "invalid Circleback signature" });
  }

  let meeting;
  try {
    meeting = JSON.parse(rawBody);
  } catch {
    return send(res, 400, { ok: false, error: "invalid JSON body" });
  }

  const { slug, markdown } = meetingToMarkdown(meeting);
  const mdPath = path.join(brainRepo, `${slug}.md`);
  const jsonPath = path.join(rawDir, `${path.basename(slug)}.json`);
  fs.mkdirSync(path.dirname(mdPath), { recursive: true });
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(mdPath, markdown);
  fs.writeFileSync(jsonPath, `${JSON.stringify(meeting, null, 2)}\n`);

  const sync = syncBrain(brainRepo, { embed: process.env.GBRAIN_EMBED_ON_INGEST !== "false" });
  return send(res, sync.ok ? 200 : 500, {
    ok: sync.ok,
    slug,
    markdownPath: mdPath,
    rawPath: jsonPath,
    gbrain: { stdout: sync.stdout, stderr: sync.stderr },
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, {
      ok: true,
      service: "circleback-gbrain",
      brainRepo,
      signatureConfigured: Boolean(signingSecret),
      requireSignature,
    });
  }
  if (req.method === "POST" && req.url === "/circleback/webhook") {
    handleWebhook(req, res).catch((error) => send(res, 500, { ok: false, error: error.message }));
    return;
  }
  send(res, 404, { ok: false, error: "not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[circleback-gbrain] listening on http://127.0.0.1:${port}`);
  console.log(`[circleback-gbrain] webhook path: /circleback/webhook`);
  if (!signingSecret) {
    console.warn("[circleback-gbrain] CIRCLEBACK_WEBHOOK_SECRET is not set; signed production webhooks will be rejected.");
  }
});
