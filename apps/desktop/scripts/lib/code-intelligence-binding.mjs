/**
 * The project the code-intelligence server was LAUNCHED against in a run, read from the application log — the live run's
 * requirements check, so that "the run was confined to a worktree of its own" is not passed on the session's worktree
 * record alone (`docs/defects/fixed/an-isolated-runs-code-intelligence-server-is-bound-to-the-anchoring-checkout.md`, finding
 * D1 of the default live run at 1763f7f: the record named the worktree and the server answered from the main checkout).
 *
 * The run host's launch lines name the project the launched description carried (REQ-MCP-034; `projectWords` in
 * `apps/desktop/src/run-host/mcp.ts`), since the transport's own launch line is written at debug:
 *
 *   mcp: discovery of 'code_intelligence' (project /ws/.rotaris/requirements/worktrees/u1) listed 22 tool(s) in 1968 ms
 *   mcp code_intelligence: connected for the session (pid 1, protocol 2025-11-25, 22 tool(s), hook code_intelligence:ok, project /ws/…/u1) in 2511 ms
 *
 * A discovery that failed carries the same words ahead of its outcome (`(project …) failed (…)`), since a failure's
 * detail can run over several lines (a child's standard error, each continuation under its own log prefix).
 */
const SERVER = 'code_intelligence';
const DISCOVERY = new RegExp(`mcp: discovery of '${SERVER}'(?: \\(project (.+?)\\))? (?:listed|failed) `);
const CONNECTED = new RegExp(`mcp ${SERVER}: connected for the session \\((.*)\\) in \\d+ ms$`);

/** Every launch line of the code-intelligence server in `log`, in order: its kind and the project it names (null: none named). */
export function codeIntelligenceLaunches(log) {
  const out = [];
  for (const line of String(log).split(/\r?\n/)) {
    const d = DISCOVERY.exec(line);
    if (d) { out.push({ kind: 'discovery', project: d[1] ?? null }); continue; }
    const c = CONNECTED.exec(line);
    if (c) {
      const at = c[1].lastIndexOf(', project ');
      out.push({ kind: 'connected', project: at === -1 ? null : c[1].slice(at + ', project '.length) });
    }
  }
  return out;
}

/**
 * The verdict: at least one launch line, and every one names `treeRoot` (compared after `normalize`, which the caller may
 * use to resolve symbolic links). The detail lists what each line named, so a red says which launch escaped the tree.
 */
export function bindingVerdict(log, treeRoot, normalize = (p) => p) {
  const launches = codeIntelligenceLaunches(log);
  const want = normalize(treeRoot);
  const named = launches.map((l) => `${l.kind}: ${l.project ?? 'no project named'}`);
  if (launches.length === 0) return { ok: false, detail: `no launch line of '${SERVER}' was logged` };
  const ok = launches.every((l) => l.project !== null && normalize(l.project) === want);
  return { ok, detail: `${ok ? 'every launch' : 'not every launch'} named ${treeRoot} — ${named.join('; ')}` };
}
