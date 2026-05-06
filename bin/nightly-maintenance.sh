#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${GBRAIN_OPENCLAW_LOG_DIR:-$HOME/Library/Logs/gbrain-openclaw}"
LOCK_DIR="${GBRAIN_OPENCLAW_NIGHTLY_LOCK:-/tmp/gbrain-openclaw-nightly.lock}"
mkdir -p "$LOG_DIR"

exec >>"$LOG_DIR/nightly-maintenance.log" 2>&1

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[$(timestamp)] Nightly maintenance already running; exiting."
  exit 0
fi
trap 'rm -rf "$LOCK_DIR"' EXIT

if [[ -f "$SCRIPT_DIR/config.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/config.env"
  set +a
fi

run_with_retries() {
  local label="$1"
  shift
  local attempts="${GBRAIN_OPENCLAW_NIGHTLY_ATTEMPTS:-3}"
  local delay="${GBRAIN_OPENCLAW_NIGHTLY_RETRY_SECONDS:-45}"
  local timeout_seconds="${GBRAIN_OPENCLAW_NIGHTLY_TIMEOUT_SECONDS:-1800}"
  local n=1

  while true; do
    echo "[$(timestamp)] Starting: $label (attempt $n/$attempts)"
    if run_with_timeout "$timeout_seconds" "$@"; then
      echo "[$(timestamp)] Finished: $label"
      return 0
    fi

    if (( n >= attempts )); then
      echo "[$(timestamp)] Failed: $label after $attempts attempts"
      return 1
    fi

    n=$((n + 1))
    sleep "$delay"
  done
}

run_with_timeout() {
  local timeout_seconds="$1"
  shift
  "$@" &
  local pid="$!"
  local elapsed=0

  while kill -0 "$pid" 2>/dev/null; do
    if (( elapsed >= timeout_seconds )); then
      echo "[$(timestamp)] Timeout after ${timeout_seconds}s: $*"
      kill "$pid" 2>/dev/null || true
      sleep 5
      kill -9 "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      return 124
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done

  wait "$pid"
}

echo "[$(timestamp)] Nightly maintenance started."

run_with_retries "Cloudflare inbox pull" node "$SCRIPT_DIR/bin/circleback-cloudflare-pull.mjs"

if [[ "${CIRCLEBACK_CLI_RECONCILE_ENABLED:-false}" == "true" ]]; then
  run_with_retries "Circleback CLI backfill" \
    node "$SCRIPT_DIR/bin/circleback-backfill.mjs" --last "${CIRCLEBACK_NIGHTLY_BACKFILL_DAYS:-14}"
else
  echo "[$(timestamp)] Circleback CLI backfill disabled. Set CIRCLEBACK_CLI_RECONCILE_ENABLED=true after circleback login."
fi

run_with_retries "GBrain maintenance" "$SCRIPT_DIR/bin/gbrain-meeting-maintenance.sh"

echo "[$(timestamp)] Nightly maintenance completed."
