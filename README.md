# pi-jev-thinking

Before each prompt, asks TypeSafe Jev how hard it is and sets pi's thinking level to match.

Jev scores the prompt on four rungs (low, medium, high, xhigh), reading it with the tail of the last assistant reply for context, and answers a second question: is this a short continuation ("yes", "go with option 2") whose difficulty depends on context? The most probable rung wins (ties go lower). An unsure continuation keeps the current level. pi clamps the result to what the active model supports.

- Runs for prompts typed in the TUI and prompts sent over RPC (Relay). Skips `/commands`, `!bash`, steers and follow-ups queued behind a running turn, extension-injected text, subagent children (`PI_SUBAGENT_CHILD`), and non-reasoning models.
- A level change it didn't make (you picking one by hand) pauses it for 3 prompts.
- Any failure (no key, timeout, API error) leaves the level alone. Timeout 2.5s; a warm call takes ~200ms.
- Every decision is appended to `~/.pi/agent/pi-jev-thinking/decisions.jsonl` for tuning.

## API key

You need a TypeSafe API key. The extension looks for it in this order:

1. The `TYPESAFE_API_KEY` or `JEV_API_KEY` environment variable.
2. `apiKeyCommand` in the config file: a command that prints the key. Use this to pull it from a password manager or secrets store instead of keeping it in your environment. A list runs the program directly; a single string runs through `sh -c`.

```json
{ "apiKeyCommand": ["op", "read", "op://Private/TypeSafe/credential"] }
```

The command runs once per session and the key is kept in memory. With no key, the extension leaves the thinking level alone.

## Config

`~/.pi/agent/pi-jev-thinking/config.json`, re-read every prompt:

```json
{ "enabled": true, "minLevel": "low", "maxLevel": "xhigh", "keepBelow": 0.6, "respectManualPrompts": 3, "timeoutMs": 2500 }
```

Those are the built-in defaults. Any key you leave out falls back to them.

### Capping the level

I keep my maximum at `high`:

```json
{ "maxLevel": "high" }
```

With that cap, a prompt Jev rates as xhigh runs at high instead. xhigh costs a lot more time and tokens, and high is enough for nearly everything I do.

If you want the hardest prompts to get extra-high thinking, set `"maxLevel": "xhigh"` or leave the key out, since xhigh is the default. `minLevel` works the same way at the bottom of the scale. `npm run probe` shows what Jev picks under your current config, and it notes when the cap lowered a level.

## Try it

`npm run probe` sends a few sample prompts to Jev and prints the level each one would get. Pass your own prompts as arguments, and use `--prev "<last reply>"` to test a short follow-up like "yes".

## Command

`/jev-thinking` status · `on` · `off` (this session) · `resume` (end a manual-change pause)

## License

MIT
