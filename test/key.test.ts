import { test } from "node:test";
import assert from "node:assert/strict";
import { keyCommand, keyFromEnv } from "../src/key.ts";

test("env: TYPESAFE_API_KEY wins, then JEV_API_KEY, blanks ignored", () => {
  assert.equal(keyFromEnv({ TYPESAFE_API_KEY: " a ", JEV_API_KEY: "b" }), "a");
  assert.equal(keyFromEnv({ TYPESAFE_API_KEY: "  ", JEV_API_KEY: "b" }), "b");
  assert.equal(keyFromEnv({}), undefined);
});

test("apiKeyCommand: array runs directly, ~/ expanded", () => {
  assert.deepEqual(keyCommand({ apiKeyCommand: ["~/bin/get-key", "JEV"] }, "/h"), ["/h/bin/get-key", "JEV"]);
});

test("apiKeyCommand: string runs through sh -c", () => {
  assert.deepEqual(keyCommand({ apiKeyCommand: "op read op://dev/jev/key" }), ["/bin/sh", "-c", "op read op://dev/jev/key"]);
});

test("apiKeyCommand: missing or malformed is undefined", () => {
  for (const raw of [undefined, null, {}, { apiKeyCommand: "" }, { apiKeyCommand: [] }, { apiKeyCommand: [1] }, { apiKeyCommand: 5 }]) {
    assert.equal(keyCommand(raw), undefined);
  }
});
