# pi-jev-thinking

Before each prompt, asks TypeSafe Jev how hard it is and sets pi's thinking level to match.

Jev scores the prompt on four rungs (low, medium, high, xhigh), reading it with the tail of the last assistant reply for context, and answers a second question: is this a short continuation ("yes", "go with option 2") whose difficulty depends on context? The most probable rung wins (ties go lower). An unsure continuation keeps the current level. pi clamps the result to what the active model supports.

- Runs for prompts typed in the TUI and prompts sent over RPC (Relay). Skips `/commands`, `!bash`, steers and follow-ups queued behind a running turn, extension-injected text, subagent children (`PI_SUBAGENT_CHILD`), and non-reasoning models.
- A level change it didn't make (you picking one by hand) pauses it for 3 prompts.
- Any failure (no key, timeout, API error) leaves the level alone. Timeout 2.5s; a warm call takes ~200ms.
- Every decision is appended to `~/.pi/agent/pi-jev-thinking/decisions.jsonl` for tuning.

Key: `TYPESAFE_API_KEY`, `JEV_API_KEY`, or Infisical `JEV_API_KEY`.

## Config

`~/.pi/agent/pi-jev-thinking/config.json`, re-read every prompt:

```json
{ "enabled": true, "minLevel": "low", "maxLevel": "xhigh", "keepBelow": 0.6, "respectManualPrompts": 3, "timeoutMs": 2500 }
```

## Command

`/jev-thinking` status · `on` · `off` (this session) · `resume` (end a manual-change pause)
