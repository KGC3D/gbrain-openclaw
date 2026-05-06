#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$SCRIPT_DIR/config.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/config.env"
  set +a
fi

BRAIN_REPO="${BRAIN_REPO:-$HOME/brain}"
if git -C "$BRAIN_REPO" rev-parse --verify HEAD >/dev/null 2>&1; then
  gbrain sync --repo "$BRAIN_REPO"
else
  gbrain import "$BRAIN_REPO" --no-embed
fi
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  gbrain embed --stale || true
else
  echo "[gbrain] embed --stale skipped: OPENAI_API_KEY is not set."
fi
gbrain extract links --source db || true
gbrain extract timeline --source db || true
gbrain doctor --json
