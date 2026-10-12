// Where the TypeSafe API key comes from, in order:
//   1. JEV_API_KEY or TYPESAFE_API_KEY in the environment. JEV_API_KEY wins because
//      extensions/jev-backend.ts may point TYPESAFE_API_KEY at SubQ for pi-jev.
//   2. `apiKeyCommand` in config.json: a command that prints the key on stdout,
//      so it can come from a password manager or secrets store.

export const NO_KEY =
  "No Jev API key: set TYPESAFE_API_KEY (or JEV_API_KEY), or add an apiKeyCommand to ~/.pi/agent/pi-jev-thinking/config.json.";

export function keyFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.JEV_API_KEY?.trim() || env.TYPESAFE_API_KEY?.trim() || undefined;
}

/**
 * `apiKeyCommand` as [program, ...args], or undefined if unset or malformed.
 * An array runs directly with no shell; a string runs through `sh -c`.
 * A leading `~/` on the program is expanded to $HOME.
 */
export function keyCommand(rawConfig: unknown, home = process.env.HOME ?? ""): string[] | undefined {
  const v = (rawConfig && typeof rawConfig === "object" ? (rawConfig as Record<string, unknown>).apiKeyCommand : undefined);
  let argv: string[];
  if (typeof v === "string" && v.trim()) argv = ["/bin/sh", "-c", v];
  else if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string") && (v[0] as string).trim()) argv = [...(v as string[])];
  else return undefined;
  if (home && argv[0]!.startsWith("~/")) argv[0] = home + argv[0]!.slice(1);
  return argv;
}
