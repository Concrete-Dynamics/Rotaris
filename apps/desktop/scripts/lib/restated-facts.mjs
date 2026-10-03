/**
 * One fact, one emitter (PD-MONITOR-002; live-run finding a71-9,
 * `docs/defects/fixed/the-repository-git-view-and-setup-step-lines-are-each-logged-twice.md`).
 *
 * The application log is main's standard output: main's own lines and the lines each child forwards, the child named as
 * the line's source (`[main <instant>] <level> <source>: <message>`, `src/main/app-log.ts`). Four facts reached it
 * twice, from two emitters each, within a millisecond — the process that did the work said it, and the process it
 * answered said it again. Each now has one owner:
 *
 *   the repository read   the workspace service (`repository <root>: git=… in N ms`), not main's command handler;
 *   the Git view          the workspace service (`git view: N reads in M ms (…)`), not main's command handler;
 *   the credentials lease the run host (`credentials: leased for …`, REQ-PROVIDER-068's report), not main's ask handler;
 *   a setup step's outcome the run host's step reporter (`mcp setup: <id> succeeded (N ms)`), not `runSetupSteps`.
 *
 * A fifth, of the same class, was found by the duress live run at 1763f7f (finding U4,
 * `docs/defects/fixed/one-mcp-discovery-failure-is-logged-twice-its-stderr-breaking-each-record.md`):
 *
 *   an MCP tool discovery's failure  `ToolDiscovery`'s REQ-MCP-048 warning (`mcp <name>: tool discovery failed in N ms (…)`),
 *                                    not the run host's `McpHost.prepare` (`mcp: discovery of '<name>' … failed (…)`), which
 *                                    keeps a success's line.
 *
 * `restatedFacts` returns every line in a launch's log written by the emitter that no longer owns its fact — the
 * restatement, never the owner's line — so a proof or a live run can say none of these facts was restated and name the
 * line if one was. It knows these `KNOWN_RESTATEMENTS` only: a duplicate of any other fact passes it.
 */
const LINE = /^\[main [^\]]+\]\s+\S+\s+(.*)$/;
const SOURCES = ['run host', 'workspace service'];

const RESTATEMENTS = Object.freeze([
  { fact: 'the repository read', owner: 'workspace service', source: null, pattern: /^repository \S.*: git=\S+ repo=/ },
  { fact: 'the Git view', owner: 'workspace service', source: null, pattern: /^git view: \d+ reads in \d+ ms/ },
  { fact: 'the credentials lease', owner: 'run host', source: null, pattern: /^credentials leased: / },
  { fact: 'a setup step\'s outcome', owner: 'run host (its step reporter)', source: 'run host', pattern: /^mcp setup: \S+ succeeded in \d+ ms/ },
  { fact: 'an MCP tool discovery\'s failure', owner: 'run host (ToolDiscovery\'s REQ-MCP-048 warning)', source: 'run host', pattern: /^mcp: discovery of '[^']+'.*? failed \(/ },
]);

/** How many restatements the reader knows, for a check's label. */
export const KNOWN_RESTATEMENTS = RESTATEMENTS.length;

/** The line's source (`null` for main's own) and its message, or `null` for a line that is not an application-log record. */
export function appLogRecord(line) {
  const m = LINE.exec(line);
  if (!m) return null;
  const body = m[1];
  for (const source of SOURCES) if (body.startsWith(`${source}: `)) return { source, message: body.slice(source.length + 2) };
  return { source: null, message: body };
}

/** Every restatement in `log`, as `{ line, fact, owner, text }` (`line` 1-based); empty when each fact is said once. */
export function restatedFacts(log) {
  const found = [];
  String(log).split('\n').forEach((text, i) => {
    const record = appLogRecord(text.replace(/\r$/, ''));
    if (record === null) return;
    for (const r of RESTATEMENTS) {
      if (r.source === record.source && r.pattern.test(record.message)) found.push({ line: i + 1, fact: r.fact, owner: r.owner, text: text.trim() });
    }
  });
  return found;
}
