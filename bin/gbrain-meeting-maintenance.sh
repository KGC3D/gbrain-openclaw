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
gbrain sync --repo "$BRAIN_REPO"
gbrain embed --stale || true
gbrain extract links --source db || true
gbrain extract timeline --source db || true
gbrain doctor --json
