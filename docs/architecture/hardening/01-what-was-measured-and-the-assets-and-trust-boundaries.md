# Hardening — the application measured against engineering standards — What was measured against what

Part 1 of 4 of [the hardening record](../hardening.md), which indexes every part.

## 1. What was measured against what

| Standard | Source read | What it covers here |
|---|---|---|
| Electron security checklist (20 items) and fuses | the Electron documentation, `tutorial/security`, `tutorial/fuses` | the renderer perimeter, IPC, packaging |
| SQLite write-ahead logging | `sqlite.org/wal.html` | the session store's durability and integrity |
| OpenSSF Scorecard checks | `ossf/scorecard`, `docs/checks.md` | the repository: CI, dependencies, SAST, SBOM, policy |
| pnpm supply-chain settings | `pnpm.io/settings` | `minimumReleaseAge`, `trustPolicy`, `allowBuilds` |

The Electron documentation and the other three are public platform documentation, an approved input (`AGENTS.md`).
Nothing was read from the sources the hard boundary names.

## 2. Assets and trust boundaries

Five processes (ADR-0002): **main** holds the windows, the credentials (ADR-0029) and the supervision; **preload** is
the one frozen bridge; the **renderer** shows web content and is the only process whose input is a page; the **run
host** runs one live session, the model calls and the tools, under the permission gate; the **workspace service** opens,
migrates, backs up and restores the store. What is protected: the person's credentials, the workspace on disk, the
session record, and the person's attention (a run must not act unasked, REQ-TOOLS-011 to REQ-TOOLS-024). What is
untrusted: a model's output, a tool's output, a provider's response, an MCP server, the content a renderer page could be
made to show. The boundaries that hold today, in one line each:

- every cross-process shape is a zod schema in `contracts`, and the one IPC handler parses before it dispatches
  (`CommandRequestSchema`, `apps/desktop/src/main/index.ts`);
- the preload exposes one `command` method and subscribe-only listeners, never `ipcRenderer`;
- every window is `sandbox: true, contextIsolation: true, nodeIntegration: false`; the CSP meta tag allows `'self'`
  scripts and `connect-src 'none'`; the permission handlers deny everything but the application's own pages' audio
  and clipboard write (OQ-459);
- `shell.openExternal` admits `http:` and `https:` alone, parsed;
- the store opens in WAL with the mode read back, a write probe, `foreign_keys` read back, `synchronous = NORMAL`
  and `FULL` for the critical commits; documents are written by temp-fsync-rename; the restore is staged and
  journaled;
- every request to a utility process has a deadline (`ProcessLink`); main-to-child messages are schema-checked both
  ways;
- the permission gate is one decision point and fails closed (REQ-TOOLS-020); egress fails closed (REQ-SANDBOX-016);
  the file tools are fenced on the real path (`fence.ts`); one redaction pass serves the gate, the hooks, MCP, the
  terminal, the session writer and the model client;
- the updater verifies a signed manifest and a SHA-256 before anything in the installation is touched
  (REQ-STARTUP-126, REQ-STARTUP-167);
- CI runs the gate on every push with SHA-pinned actions and a read-only token (R-079).
