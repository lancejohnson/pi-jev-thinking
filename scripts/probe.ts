/**
 * Live probe: send prompts to Jev and print the thinking level the extension would pick.
 *
 *   npm run probe                          # built-in sample prompts
 *   npm run probe -- "fix the typo" "why does the queue deadlock?"
 *   npm run probe -- --prev "Want me to push it?" "yes"   # rate a continuation
 *
 * Uses the same buildRequest/decide as index.ts and the live config file.
 * Key: TYPESAFE_API_KEY, JEV_API_KEY, or Infisical JEV_API_KEY.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { buildRequest, decide, LADDER, normalizeConfig, type Config } from "../src/decide.ts";

const HOME = process.env.HOME ?? "";
const CONFIG = join(HOME, ".pi/agent/pi-jev-thinking/config.json");
const INF_SECRET = join(HOME, ".claude/skills/api-call/scripts/inf-secret");

const SAMPLES = [
  "rename getUser to fetchUser in auth.ts",
  "what does this regex match? ^\\d{3}-\\d{4}$",
  "add a --dry-run flag to the deploy script",
  "the websocket reconnect sometimes drops messages after a server restart, find out why",
  "design the sync layer between the iOS app and the CRM so edits made offline don't clobber each other",
];

function readConfig(): Config {
  try {
    return normalizeConfig(JSON.parse(readFileSync(CONFIG, "utf8")));
  } catch {
    return normalizeConfig({});
  }
}

function apiKey(): string {
  const fromEnv = process.env.TYPESAFE_API_KEY?.trim() || process.env.JEV_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    const key = execFileSync(INF_SECRET, ["JEV_API_KEY"], { encoding: "utf8", timeout: 30_000 }).trim();
    if (key) return key;
  } catch {}
  throw new Error("No Jev API key: set TYPESAFE_API_KEY / JEV_API_KEY, or check Infisical JEV_API_KEY.");
}

const argv = process.argv.slice(2);
let previous = "";
const prompts: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--prev") previous = argv[++i] ?? "";
  else prompts.push(argv[i]!);
}
if (prompts.length === 0) prompts.push(...SAMPLES);

const cfg = readConfig();
// Probing is not latency-bound like a live prompt; allow a slower first call.
const timeout = Math.max(cfg.timeoutMs, 15_000);
const client = new TypeSafeClient({ apiKey: apiKey(), defaultModel: "jev-latest", logLevel: "off" });

console.log(`config: ${cfg.minLevel}..${cfg.maxLevel}, keepBelow ${cfg.keepBelow}${previous ? `, previous reply: "${previous}"` : ""}\n`);

let failures = 0;
for (const prompt of prompts) {
  const t0 = Date.now();
  try {
    const res = await client.systemOne(buildRequest(prompt, previous), { timeout, retry: { maxRetries: 0 } });
    const d = res.answers.difficulty;
    const probabilities = LADDER.map((_, i) => Number((d.probabilities as Record<string, number>)[String(i)] ?? 0));
    const cont = res.answers.continuation.noul;
    const decision = decide({ probabilities, expected: d.score, continuation: cont }, cfg);
    const dist = LADDER.map((l, i) => `${l} ${probabilities[i]!.toFixed(2)}`).join("  ");
    const verdict = decision.action === "set" ? `→ ${decision.level}` : "→ keep current";
    console.log(`${verdict.padEnd(16)} ${Date.now() - t0}ms  "${prompt}"`);
    console.log(`                 ${dist}  continuation ${cont.toFixed(2)}  (${decision.why})\n`);
  } catch (err) {
    failures++;
    console.log(`ERROR ${Date.now() - t0}ms  "${prompt}": ${err instanceof Error ? err.message : String(err)}\n`);
  }
}
process.exit(failures ? 1 : 0);
