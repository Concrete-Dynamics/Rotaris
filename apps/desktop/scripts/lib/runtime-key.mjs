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
  return withSectionKey(yaml, 'runtime', key, value);
}

/**
 * The same for any top-level section (`rotaris:`'s `delegation_strategy`, the live run's `delegation` scenario, PD-ORCH-006):
 * the key's line replaced under `<section>:`, else inserted directly after it, else a `<section>:` block appended.
 */
export function withSectionKey(yaml, section, key, value) {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^${escaped(section)}:\\s*$`).test(line));
  if (start === -1) {
    const body = yaml === '' || yaml.endsWith('\n') ? yaml : `${yaml}\n`;
    return `${body}${section}:\n  ${key}: ${value}\n`;
  }
  let end = start + 1;
  while (end < lines.length && (lines[end] === '' || /^\s/.test(lines[end]))) end += 1;
  const pattern = new RegExp(`^(\\s+)${escaped(key)}:.*$`);
  for (let i = start + 1; i < end; i += 1) {
    const m = pattern.exec(lines[i]);
    if (m) { lines[i] = `${m[1]}${key}: ${value}`; return lines.join('\n'); }
  }
  lines.splice(start + 1, 0, `  ${key}: ${value}`);
  return lines.join('\n');
}

/**
 * One key of one persona's entry under `personas:` (REQ-CONFIG-101: the live run's `delegation` scenario gives the orchestrator
 * `delegates_to`, OQ-229). The key's line under `  <persona>:` is replaced, else inserted directly after that line; a persona
 * the section does not name gets an entry directly after `personas:`; a file with no `personas:` gets the block appended. An
 * entry written in flow style (`  <persona>: { … }`) is refused rather than rewritten, since a line edit cannot reach into it.
 */
export function withPersonaKey(yaml, persona, key, value) {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => /^personas:\s*$/.test(line));
  if (start === -1) {
    const body = yaml === '' || yaml.endsWith('\n') ? yaml : `${yaml}\n`;
    return `${body}personas:\n  ${persona}:\n    ${key}: ${value}\n`;
  }
  let end = start + 1;
  while (end < lines.length && (lines[end] === '' || /^\s/.test(lines[end]))) end += 1;
  const entry = lines.findIndex((line, i) => i > start && i < end && new RegExp(`^  ${escaped(persona)}:`).test(line));
  if (entry === -1) {
    lines.splice(start + 1, 0, `  ${persona}:`, `    ${key}: ${value}`);
    return lines.join('\n');
  }
  if (!new RegExp(`^  ${escaped(persona)}:\\s*$`).test(lines[entry])) throw new Error(`personas.${persona} is written in flow style; withPersonaKey edits block entries only: ${lines[entry]}`);
  let last = entry + 1;
  while (last < end && (lines[last] === '' || /^ {4}/.test(lines[last]))) last += 1;
  const pattern = new RegExp(`^ {4}${escaped(key)}:.*$`);
  for (let i = entry + 1; i < last; i += 1) {
    if (pattern.test(lines[i])) { lines[i] = `    ${key}: ${value}`; return lines.join('\n'); }
  }
  lines.splice(entry + 1, 0, `    ${key}: ${value}`);
  return lines.join('\n');
}

function escaped(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
