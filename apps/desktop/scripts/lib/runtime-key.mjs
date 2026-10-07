/**
 * One `runtime:` key of a workspace's `.rotaris/agents.yaml`, written as the harness needs it for one launch — the stored
 * value Settings' Save writes (PD-CONFIG-003), so a launch reads it as a user who raised the control would have it.
 *
 * `withRuntimeKey(yaml, key, value)` replaces the indented `key:` line under `runtime:` where there is one; otherwise it
 * inserts the key directly after `runtime:`; otherwise it appends a `runtime:` block holding it. Nothing else in the text
 * changes. A same-named key under another section (`circuit_breaker:`'s, say) is not `runtime:`'s and is never touched.
 *
 * Shared by `live-run.mjs`'s faults-args launch (`child_stall_timeout`) and its duress launch (`child_timeout`, OQ-214
 * reopened and ruled 2026-10-07 under R-072). Verification only; the product's own writer is `packages/config`'s.
 */
export function withRuntimeKey(yaml, key, value) {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => /^runtime:\s*$/.test(line));
  if (start === -1) {
    const body = yaml === '' || yaml.endsWith('\n') ? yaml : `${yaml}\n`;
    return `${body}runtime:\n  ${key}: ${value}\n`;
  }
  let end = start + 1;
  while (end < lines.length && (lines[end] === '' || /^\s/.test(lines[end]))) end += 1;
  const pattern = new RegExp(`^(\\s+)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:.*$`);
  for (let i = start + 1; i < end; i += 1) {
    const m = pattern.exec(lines[i]);
    if (m) { lines[i] = `${m[1]}${key}: ${value}`; return lines.join('\n'); }
  }
  lines.splice(start + 1, 0, `  ${key}: ${value}`);
  return lines.join('\n');
}
