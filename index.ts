// pi-jev-thinking — before each prompt, ask TypeSafe Jev how hard it is and set
// pi's thinking level to match. Inspired by aesisify/pi-auto-thinking, which asks
// a small LLM for one word; Jev answers with a typed score and per-rung
// probabilities in ~170ms, so there is nothing to parse and a real confidence to
// act on.

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { keyCommand, keyFromEnv, NO_KEY } from "./src/key.ts";
import { buildRequest, decide, lastAssistantText, LADDER, normalizeConfig, type Config, type Decision } from "./src/decide.ts";

const HOME = process.env.HOME ?? "";
const CONFIG = join(HOME, ".pi/agent/pi-jev-thinking/config.json");
const LOG = join(HOME, ".pi/agent/pi-jev-thinking/decisions.jsonl");
const STATUS = "jev-thinking";

interface Last extends Partial<Decision> {
  prompt: string;
  from: string;
  to: string;
  ms: number;
  error?: string;
}

function readConfig(): Config {
  try {
    return normalizeConfig(JSON.parse(readFileSync(CONFIG, "utf8")));
  } catch {
    return normalizeConfig({});
  }
}

export default function jevThinking(pi: ExtensionAPI) {
  // Subagents are launched with the level their parent chose on purpose.
  if (process.env.PI_SUBAGENT_CHILD) return;

  let cfg = readConfig();
  let sessionOff = false;
  let pausedPrompts = 0;
  let expected: { level: string; at: number } | undefined;
  let modelChangedAt = 0;
  let last: Last | undefined;
  let cachedKey: string | undefined;
  let client: TypeSafeClient | undefined;

  async function apiKey(signal?: AbortSignal): Promise<string> {
    const fromEnv = keyFromEnv();
    if (fromEnv) return fromEnv;
    if (cachedKey) return cachedKey;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(CONFIG, "utf8"));
    } catch {}
    const cmd = keyCommand(raw);
    if (!cmd) throw new Error(NO_KEY);
    const result = await pi.exec(cmd[0]!, cmd.slice(1), { signal, timeout: 30_000 });
    if (result.code !== 0 || !result.stdout.trim()) throw new Error(`apiKeyCommand failed (exit ${result.code})`);
    cachedKey = result.stdout.trim();
    return cachedKey;
  }

  const active = () => cfg.enabled && !sessionOff;

  function paint(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;
    if (!active()) return ctx.ui.setStatus(STATUS, undefined);
    if (pausedPrompts > 0) return ctx.ui.setStatus(STATUS, `jev⏸${pausedPrompts}`);
    ctx.ui.setStatus(STATUS, last ? `jev→${last.to}${last.action === "keep" ? "◆" : ""}` : "jev");
  }

  function record(entry: Last) {
    last = entry;
    try {
      mkdirSync(dirname(LOG), { recursive: true });
      appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
    } catch {
      // Logging is for tuning; never let it cost a turn.
    }
  }

  pi.on("session_start", (_e, ctx) => {
    cfg = readConfig();
    paint(ctx);
  });

  pi.on("model_select", () => {
    modelChangedAt = Date.now();
  });

  // A change we did not make is a person choosing a level; stand back for a while.
  pi.on("thinking_level_select", (event, ctx) => {
    if (expected && expected.level === event.level && Date.now() - expected.at < 2000) {
      expected = undefined;
      return;
    }
    if (Date.now() - modelChangedAt < 2000) return; // pi re-clamping for a new model
    if (!active() || cfg.respectManualPrompts <= 0) return;
    pausedPrompts = cfg.respectManualPrompts;
    paint(ctx);
  });

  pi.on("input", async (event, ctx) => {
    // Typed in the TUI or sent over RPC (Relay). Not extension-injected text,
    // and not steers or follow-ups queued behind a running turn.
    if (event.source === "extension" || event.streamingBehavior) return { action: "continue" };
    const text = event.text.trim();
    if (!text || text.startsWith("/") || text.startsWith("!")) return { action: "continue" };
    cfg = readConfig();
    if (!active() || !ctx.model?.reasoning) return { action: "continue" };
    if (pausedPrompts > 0) {
      pausedPrompts--;
      paint(ctx);
      return { action: "continue" };
    }

    const from = pi.getThinkingLevel();
    const t0 = Date.now();
    const snippet = text.replace(/\s+/g, " ").slice(0, 80);
    try {
      client ??= new TypeSafeClient({ apiKey: await apiKey(ctx.signal), defaultModel: "jev-latest", logLevel: "off" });
      const previous = lastAssistantText(ctx.sessionManager.getBranch());
      const res = await client.systemOne(buildRequest(text, previous), { timeout: cfg.timeoutMs, retry: { maxRetries: 0 } });
      const d = res.answers.difficulty;
      const probabilities = LADDER.map((_, i) => Number((d.probabilities as Record<string, number>)[String(i)] ?? 0));
      const decision = decide({ probabilities, expected: d.score, continuation: res.answers.continuation.noul }, cfg);
      if (decision.action === "set" && decision.level && decision.level !== from) {
        pi.setThinkingLevel(decision.level);
        expected = { level: pi.getThinkingLevel(), at: Date.now() };
      }
      record({ ...decision, prompt: snippet, from, to: pi.getThinkingLevel(), ms: Date.now() - t0 });
    } catch (err) {
      record({ prompt: snippet, from, to: from, ms: Date.now() - t0, action: "keep", error: err instanceof Error ? err.message : String(err) });
    }
    paint(ctx);
    return { action: "continue" };
  });

  pi.registerCommand("jev-thinking", {
    description: "Jev picks the thinking level per prompt: status | on | off | resume",
    handler: async (args, ctx) => {
      const sub = (args ?? "").trim().toLowerCase();
      if (sub === "off") sessionOff = true;
      else if (sub === "on") sessionOff = false;
      else if (sub === "resume") pausedPrompts = 0;
      cfg = readConfig();
      const lines = [
        `jev-thinking: ${active() ? "on" : "off"}${cfg.enabled ? "" : " (disabled in config)"}${pausedPrompts ? `, paused for ${pausedPrompts} prompt(s) after a manual change` : ""}`,
        `bounds: ${cfg.minLevel}…${cfg.maxLevel}  keep-below: ${cfg.keepBelow}  timeout: ${cfg.timeoutMs}ms`,
        `config: ${CONFIG}`,
        last
          ? `last: ${last.from} → ${last.to} in ${last.ms}ms — ${last.error ? `error: ${last.error}` : `${last.action}: ${last.why}`}  "${last.prompt}"`
          : "last: (none yet)",
      ];
      ctx.ui.notify(lines.join("\n"), "info");
      paint(ctx);
    },
  });
}
