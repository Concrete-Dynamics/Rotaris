/**
 * Whether a launch's code-intelligence discovery succeeded, read from its application log — so a live run can never pass
 * over a launch in which code intelligence did not run
 * (`docs/defects/fixed/the-live-run-runs-without-the-code-intelligence-bundle-and-passes-without-saying-so.md`, finding U5 of the
 * duress live run at 1763f7f: the tree had no bundle, setup and discovery failed, and all 18 checks passed in silence).
 *
 * The lines it reads (the run host's, `apps/desktop/src/run-host/mcp.ts` and `packages/mcp/src/discovery.ts`):
 *
 *   mcp: discovery of 'code_intelligence' (project /ws) listed 22 tool(s) in 1968 ms               a success
 *   mcp code_intelligence (project /ws): tool discovery failed in 973 ms (…); the persona prompt …   a failure (REQ-MCP-048)
 *   mcp: discovery of 'code_intelligence' (project /ws) failed (…) in 508 ms                         a failure, before 2026-10-03
 *   mcp setup: create failed — exited with code 127; its last output: …                              a setup step that failed
 *
 * Discovery runs when a run starts (`McpHost.prepare`), so a launch that starts none — the sign-in, the shell relaunch —
 * has nothing to read; that is `absent`, and the setup's own failure, where the log holds one, is `setup-failed`.
 */
const SERVER = 'code_intelligence';
const LISTED = new RegExp(`mcp: discovery of '${SERVER}'(?: \\(project (.+?)\\))? listed (\\d+) tool\\(s\\) in (\\d+) ms`);
const FAILED = new RegExp(`mcp ${SERVER}(?: \\(project (.+?)\\))?: tool discovery failed(?: in (\\d+) ms)? \\((.*)$`);
const FAILED_BEFORE = new RegExp(`mcp: discovery of '${SERVER}'(?: \\(project (.+?)\\))? failed \\((.*)$`);
const SETUP_FAILED = /mcp setup: (\S+) failed — (.*)$/;

const clip = (text, max = 240) => (text.length > max ? `${text.slice(0, max)}…` : text);

/**
 * `{ outcome, detail }`: `listed` when every discovery of the server listed its tools, `failed` when any failed, `setup-failed`
 * when none ran and a setup step failed, `absent` when none ran. The detail names each line read.
 */
export function codeIntelligenceDiscovery(log) {
  const listed = [];
  const failed = [];
  const setup = [];
  for (const line of String(log ?? '').split(/\r?\n/)) {
    const l = LISTED.exec(line);
    if (l) { listed.push(`listed ${l[2]} tool(s) in ${l[3]} ms${l[1] ? ` (project ${l[1]})` : ''}`); continue; }
    const f = FAILED.exec(line);
    if (f) { failed.push(`failed${f[2] ? ` in ${f[2]} ms` : ''}${f[1] ? ` (project ${f[1]})` : ''}: ${clip(f[3])}`); continue; }
    const b = FAILED_BEFORE.exec(line);
    if (b) { failed.push(`failed${b[1] ? ` (project ${b[1]})` : ''}: ${clip(b[2])}`); continue; }
    const s = SETUP_FAILED.exec(line);
    if (s) setup.push(`setup step ${s[1]} failed — ${clip(s[2])}`);
  }
  if (failed.length > 0) return { outcome: 'failed', detail: [...failed, ...listed, ...setup].join(' | ') };
  if (listed.length > 0) return { outcome: 'listed', detail: [...listed, ...setup].join(' | ') };
  if (setup.length > 0) return { outcome: 'setup-failed', detail: `no discovery ran in this launch, and ${setup.join(' | ')}` };
  return { outcome: 'absent', detail: 'no run started a discovery in this launch' };
}
