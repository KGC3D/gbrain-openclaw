import { spawnSync } from "node:child_process";

const pathWithBun = `${process.env.HOME}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}`;

export function runGBrain(args, options = {}) {
  const result = spawnSync("gbrain", args, {
    encoding: "utf8",
    env: { ...process.env, PATH: pathWithBun },
    ...options,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

export function syncBrain(repo, { embed = true } = {}) {
  const hasGitHead = spawnSync("git", ["-C", repo, "rev-parse", "--verify", "HEAD"], {
    encoding: "utf8",
    env: { ...process.env, PATH: pathWithBun },
  }).status === 0;

  const sync = hasGitHead ? runGBrain(["sync", "--repo", repo]) : { ok: false, stdout: "", stderr: "" };
  const base = sync.ok ? sync : runGBrain(["import", repo, "--no-embed"]);
  if (!base.ok) {
    return {
      ...base,
      stderr: [
        sync.stderr || sync.stdout ? `[gbrain sync failed]\n${sync.stderr || sync.stdout}` : "",
        base.stderr || base.stdout ? `[gbrain import fallback failed]\n${base.stderr || base.stdout}` : "",
      ].filter(Boolean).join("\n\n"),
    };
  }
  if (!embed) return base;
  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: true,
      status: 0,
      stdout: base.stdout,
      stderr: `${base.stderr}\n[gbrain] embed --stale skipped: OPENAI_API_KEY is not set.`.trim(),
    };
  }

  const embedResult = runGBrain(["embed", "--stale"]);
  if (!embedResult.ok) {
    return {
      ok: true,
      status: 0,
      stdout: base.stdout,
      stderr: `${base.stderr}\n[gbrain] embed --stale skipped or failed:\n${embedResult.stderr || embedResult.stdout}`.trim(),
    };
  }
  return { ok: true, status: 0, stdout: `${base.stdout}\n${embedResult.stdout}`.trim(), stderr: base.stderr };
}
