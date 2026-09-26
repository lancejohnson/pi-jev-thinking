import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequest, decide, lastAssistantText, normalizeConfig } from "../src/decide.ts";

const cfg = normalizeConfig({});

test("picks the most probable rung", () => {
  assert.deepEqual(decide({ probabilities: [0.05, 0.95, 0, 0], expected: 0.95, continuation: 0.2 }, cfg).level, "medium");
  assert.equal(decide({ probabilities: [0, 0, 0.04, 0.96], expected: 2.96, continuation: 0.1 }, cfg).level, "xhigh");
});

test("ties go to the lower rung", () => {
  assert.equal(decide({ probabilities: [0.5, 0.5, 0, 0], expected: 0.5, continuation: 0 }, cfg).level, "low");
});

test("an unsure continuation keeps the current level", () => {
  const d = decide({ probabilities: [0.44, 0.19, 0.29, 0.08], expected: 1.02, continuation: 0.85 }, cfg);
  assert.equal(d.action, "keep");
});

test("a confident continuation still sets", () => {
  const d = decide({ probabilities: [0.86, 0.07, 0.02, 0.05], expected: 0.27, continuation: 0.89 }, cfg);
  assert.equal(d.action, "set");
  assert.equal(d.level, "low");
});

test("clamps to configured bounds", () => {
  const c = normalizeConfig({ minLevel: "medium", maxLevel: "high" });
  assert.equal(decide({ probabilities: [1, 0, 0, 0], expected: 0, continuation: 0 }, c).level, "medium");
  assert.equal(decide({ probabilities: [0, 0, 0, 1], expected: 3, continuation: 0 }, c).level, "high");
});

test("bad config falls back to defaults", () => {
  const c = normalizeConfig({ minLevel: "xhigh", maxLevel: "low", timeoutMs: "x", enabled: 0 });
  assert.equal(c.minLevel, "low");
  assert.equal(c.maxLevel, "xhigh");
  assert.equal(c.timeoutMs, 2500);
  assert.equal(c.enabled, true);
});

test("request redacts secrets and carries both questions", () => {
  const r = buildRequest("use api_key=sk-123 to fix it", "");
  assert.match(r.state.user_prompt_to_coding_agent, /\[REDACTED\]/);
  assert.doesNotMatch(r.state.user_prompt_to_coding_agent, /sk-123/);
  assert.deepEqual(Object.keys(r.questions), ["difficulty", "continuation"]);
});

test("finds the last assistant text on the branch", () => {
  const entries = [
    { type: "message", message: { role: "assistant", content: [{ type: "text", text: "old" }] } },
    { type: "message", message: { role: "assistant", content: [{ type: "text", text: "new" }, { type: "toolCall" }] } },
    { type: "message", message: { role: "toolResult", content: [{ type: "text", text: "tool" }] } },
    { type: "thinking_level_change" },
  ];
  assert.equal(lastAssistantText(entries), "new");
  assert.equal(lastAssistantText([]), "");
});
