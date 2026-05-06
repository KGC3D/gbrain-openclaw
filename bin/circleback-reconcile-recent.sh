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

node "$SCRIPT_DIR/bin/circleback-backfill.mjs" --last "${CIRCLEBACK_RECONCILE_DAYS:-2}"
"$SCRIPT_DIR/bin/gbrain-meeting-maintenance.sh"
