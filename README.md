# GBrain OpenClaw Circleback Bridge

A small local bridge that turns Circleback meetings into durable GBrain memory for OpenClaw.

Best operating model:

1. Circleback captures meetings and remains the source of truth.
2. Circleback webhook posts completed meetings to this Mac mini.
3. This receiver writes clean Markdown into `~/brain/meetings/circleback/` and raw JSON into `~/brain/raw/circleback/`.
4. GBrain syncs and embeds those pages.
5. OpenClaw answers and acts from GBrain memory instead of treating every meeting as a fresh context lookup.

## Local endpoints

- Health: `http://127.0.0.1:3137/health`
- Circleback webhook path: `/circleback/webhook`

Circleback needs a public HTTPS URL for webhooks. Put a stable tunnel or reverse proxy in front of this local endpoint, then configure the automation to send:

```text
https://YOUR-PUBLIC-DOMAIN/circleback/webhook
```

Use the signing secret Circleback shows in the webhook step and paste it into `config.env`.

Recommended exposure options, in order:

1. Tailscale Funnel on the Mac mini, if you already use Tailscale and want a stable public `https://...ts.net` URL.
2. A reserved ngrok domain pointed at `http://127.0.0.1:3137`.
3. A small VPS or reverse proxy that forwards only `/circleback/webhook` to this Mac mini over a private tunnel.

Do not expose the OpenClaw gateway itself. Keep OpenClaw loopback-only; expose only this narrow webhook receiver.

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

The installer also adds `ai.openclaw.circleback-gbrain-reconcile`, which runs every 15 minutes and backfills the last 2 days. It starts working after `circleback login` succeeds.

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
