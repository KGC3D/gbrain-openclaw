#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_SRC="$ROOT/launchd/ai.openclaw.circleback-gbrain.plist"
PLIST_DST="$HOME/Library/LaunchAgents/ai.openclaw.circleback-gbrain.plist"
RECONCILE_PLIST_SRC="$ROOT/launchd/ai.openclaw.circleback-gbrain-reconcile.plist"
RECONCILE_PLIST_DST="$HOME/Library/LaunchAgents/ai.openclaw.circleback-gbrain-reconcile.plist"
NODE_BIN="$(command -v node)"

mkdir -p "$HOME/brain/meetings/circleback" "$HOME/brain/raw/circleback" "$HOME/Library/LaunchAgents"

if [[ ! -f "$ROOT/config.env" ]]; then
  cp "$ROOT/config.env.example" "$ROOT/config.env"
  chmod 600 "$ROOT/config.env"
fi

chmod +x "$ROOT/bin/"*.mjs "$ROOT/bin/"*.sh
sed \
  -e "s#__ROOT__#$ROOT#g" \
  -e "s#__HOME__#$HOME#g" \
  -e "s#__NODE__#$NODE_BIN#g" \
  "$PLIST_SRC" > "$PLIST_DST"
sed \
  -e "s#__ROOT__#$ROOT#g" \
  -e "s#__HOME__#$HOME#g" \
  "$RECONCILE_PLIST_SRC" > "$RECONCILE_PLIST_DST"

launchctl bootout "gui/$UID" "$PLIST_DST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$UID" "$PLIST_DST"
launchctl kickstart -k "gui/$UID/ai.openclaw.circleback-gbrain"

launchctl bootout "gui/$UID" "$RECONCILE_PLIST_DST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$UID" "$RECONCILE_PLIST_DST"

echo "Circleback -> GBrain receiver installed."
echo "Local health: http://127.0.0.1:3137/health"
echo "Webhook path: http://127.0.0.1:3137/circleback/webhook"
echo "Recent-meeting reconcile: every 15 minutes"
echo "Edit secrets: $ROOT/config.env"
