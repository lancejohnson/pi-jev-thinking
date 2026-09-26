const ASSIGNMENT = /(password|passwd|secret|token|api[_-]?key|authorization|bearer)\s*[:=]\s*/i;

export function redact(value: string, max = 8000): string {
  let out = "";
  for (let i = 0; i < value.length && out.length < max; i++) {
    const match = ASSIGNMENT.exec(value.slice(i));
    if (!match || match.index !== 0) {
      out += value[i];
      continue;
    }
    out += value.slice(i, i + match[0].length) + "[REDACTED]";
    i += match[0].length - 1;
    const next = value[i + 1];
    if (next === '"' || next === "'" || next === "`") {
      const quote = next;
      i += 1;
      for (let j = i + 1; j < value.length; j++) {
        if (value[j] === "\\" ) { j++; continue; }
        if (value[j] === quote) { i = j; break; }
        if (j === value.length - 1) i = j;
      }
      continue;
    }
    while (i + 1 < value.length && !/\s/.test(value[i + 1])) i++;
  }
  return out.length >= max ? out.slice(0, max) + "…[truncated]" : out;
}
