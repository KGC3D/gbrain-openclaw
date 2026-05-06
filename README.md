# GBrain OpenClaw Circleback Bridge

A small local bridge that turns Circleback meetings into durable GBrain memory for OpenClaw.

Best operating model:

1. Circleback captures meetings and remains the source of truth.
2. Circleback webhook posts completed meetings to an always-online Cloudflare Worker.
3. The Worker verifies Circleback's signature and stores raw JSON in KV.
4. This Mac pulls the Worker's pending inbox privately, writes clean Markdown into `~/brain/meetings/circleback/`, writes raw JSON into `~/brain/raw/circleback/`, syncs GBrain, then acks the Worker.
5. Circleback CLI reconciliation runs as a backup for missed webhooks.
6. OpenClaw answers and acts from GBrain memory instead of treating every meeting as a fresh context lookup.

```text
Circleback completed meeting
  -> signed webhook to Cloudflare Worker
  -> Worker verifies x-signature
  -> Worker stores raw JSON in KV
  -> Mac pulls pending inbox with CONTROL_ROOM_PULL_SECRET
  -> Mac writes raw + canonical Markdown into ~/brain
  -> GBrain sync + embed
  -> Mac acks Worker inbox as processed
  -> OpenClaw uses GBrain memory
```

## Local endpoints

- Health: `http://127.0.0.1:3137/health`
- Circleback webhook path: `/circleback/webhook`

The local webhook receiver is optional. Prefer the Cloudflare Worker inbox pattern when the Mac may sleep, move networks, or sit behind NAT.

Circleback can post directly to the local receiver only if you put a stable tunnel or reverse proxy in front of this local endpoint:

```text
https://YOUR-PUBLIC-DOMAIN/circleback/webhook
```

Use the signing secret Circleback shows in the webhook step and paste it into `config.env`.

Recommended exposure options for the optional direct-local receiver:

1. Tailscale Funnel on the Mac mini, if you already use Tailscale and want a stable public `https://...ts.net` URL.
2. A reserved ngrok domain pointed at `http://127.0.0.1:3137`.
3. A small VPS or reverse proxy that forwards only `/circleback/webhook` to this Mac mini over a private tunnel.

Do not expose the OpenClaw gateway itself. Keep OpenClaw loopback-only; expose only this narrow webhook receiver.

## Cloudflare Worker Inbox

Set these in `config.env`:

```bash
CIRCLEBACK_WORKER_URL=https://your-worker.example.workers.dev
CIRCLEBACK_WORKER_PENDING_PATH=/api/inbox/pending
CIRCLEBACK_WORKER_ACK_PATH=/api/inbox/ack
CONTROL_ROOM_PULL_SECRET=your-local-pull-secret
```

Pull pending meetings once:

```bash
node ./bin/circleback-cloudflare-pull.mjs
```

The puller accepts common pending response shapes:

```json
[{ "id": "meeting:123", "payload": { "id": 123, "name": "Meeting" } }]
```

or:

```json
{ "items": [{ "key": "meeting:123", "meeting": { "id": 123, "name": "Meeting" } }] }
```

It acks with:

```json
{ "ids": ["meeting:123"], "keys": ["meeting:123"], "processedAt": "..." }
```

## Backfill

After authenticating the Circleback CLI with `circleback login`, import recent meetings:

```bash
node ./bin/circleback-backfill.mjs --last 30
```

## Maintenance

Run this after batches or nightly:

```bash
./bin/gbrain-meeting-maintenance.sh
```

The installer also adds `ai.openclaw.circleback-gbrain-reconcile`, which runs every 15 minutes. It pulls the Cloudflare Worker inbox first, then optionally backfills the last 2 days through Circleback CLI. Circleback CLI backfill starts working after `circleback login` succeeds.

## OpenClaw habit

For meeting-related questions, OpenClaw should prefer:

```bash
gbrain query "meeting question here"
```

For fresh Circleback-only lookup before a webhook/backfill has landed:

```bash
cb meetings search "keyword" --last 30 --json
cb meetings read MEETING_ID --json
cb transcripts read MEETING_ID --json
```

## Install

Prerequisites:

- macOS
- Node.js
- Bun
- `gbrain` linked on PATH
- Circleback CLI: `npm install -g @circleback/cli`
- OpenClaw installed separately

Install the local services:

```bash
cp config.env.example config.env
$EDITOR config.env
./install.sh
```

Then authenticate Circleback:

```bash
circleback login
```

Configure OpenClaw MCP:

```bash
openclaw mcp set gbrain '{"command":"'"$HOME"'/.bun/bin/gbrain","args":["serve"]}'
openclaw mcp set circleback '{"url":"https://app.circleback.ai/api/mcp"}'
openclaw gateway restart
```

## Security

This repo intentionally ships no secrets and no meeting data. Keep `config.env` local. The receiver rejects unsigned webhook requests when `CIRCLEBACK_REQUIRE_SIGNATURE=true`.
