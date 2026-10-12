// Which decision API to ask. ~/.pi/agent/jev-backend.json is shared with pi-jev:
//   { "backend": "subq", "model": "subq-snap-preview" }   (the default)
//   { "backend": "jev" }                                   (TypeSafe Jev)
// PI_JEV_BACKEND=jev|subq overrides it. SubQ Snap takes the same request as Jev, with a
// 384K-token window instead of 64K, so it also gets more of the previous reply.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Backend {
  name: "subq" | "jev";
  baseURL: string;
  model: string;
  /** Characters of the previous assistant reply to send. */
  contextChars: number;
  /** Environment variable, then ~/.pi/agent/secrets/<keyFile>. */
  keyEnv: string;
  keyFile: string;
}

export function readBackend(env: NodeJS.ProcessEnv = process.env, home = env.HOME ?? ""): Backend {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(readFileSync(join(home, ".pi/agent/jev-backend.json"), "utf8"));
  } catch {}
  const name = String(env.PI_JEV_BACKEND || raw.backend || "subq").toLowerCase() === "jev" ? "jev" : "subq";
  if (name === "jev") {
    return { name, baseURL: "https://api.typesafe.ai", model: "jev-latest", contextChars: 1500, keyEnv: "JEV_API_KEY", keyFile: "typesafe_api_key" };
  }
  return {
    name,
    baseURL: typeof raw.baseURL === "string" ? raw.baseURL : "https://api.subq.ai",
    model: typeof raw.model === "string" ? raw.model : "subq-snap-preview",
    contextChars: 8000,
    keyEnv: "SUBQ_API_KEY",
    keyFile: "subq_api_key",
  };
}

export function backendKey(b: Backend, env: NodeJS.ProcessEnv = process.env, home = env.HOME ?? ""): string | undefined {
  const fromEnv = env[b.keyEnv]?.trim();
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(join(home, ".pi/agent/secrets", b.keyFile), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}
