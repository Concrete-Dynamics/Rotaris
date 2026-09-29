/**
 * Part AL2 — the run-host half of `pnpm terminal-proof`'s REQ-SHELL-166 section, as a Node child of the Electron half.
 *
 * It is the PRODUCT's own modules in the product's own arrangement, minus Electron: the real terminal manager over the
 * host's real shell (REQ-TOOLS-104: PowerShell on Windows, a POSIX shell elsewhere; `ready.shell` says which) in a real
 * pseudo-terminal (`@rotaris/agent-tools`, node-pty), the real streams registry behind it,
 * the real `createTerminalHost` of `apps/desktop/src/run-host/terminal.ts` answering the seven `terminal.*` requests
 * (so the key table, the write-back refusals and REQ-SHELL-107's audit wording are the shipped code), and the real
 * `FrameDeliveryLimiter` of `apps/desktop/src/main/terminal.ts` over a real `UpdateRelay` at the point of delivery.
 * The Electron half relays what this process emits on channel 3 to the page over the proof's preload, and the page's
 * actions come back here as the same `terminal.*` requests the renderer sends — one process hop each way, as in the
 * product (renderer → main → run host). Bundled by `terminal-proof.mjs` with esbuild; never part of the product.
 *
 * Protocol: JSON lines. In: `{id, op, ...}`; out: `{id, ...}` per request, `{frame}` for every frame the limiter
 * delivers to the one attached window, `{log}` for diagnostics. `deliver:false` unsubscribes the window from the
 * session — the "window closed" arrangement of REQ-SHELL-103/166's throughput criterion.
 */
import { createInterface } from 'node:readline';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { findShell, nodePtyFactory, TerminalManager, terminalTool, TERMINAL_DEFAULTS } from '../../../../packages/agent-tools/src/terminal/index.ts';
import { nodeClocks } from '../../../../packages/platform/src/clock.ts';
import { UpdateRelay } from '../../../../packages/shell/src/index.ts';
import { CHANNEL } from '../../../../packages/contracts/src/index.ts';
import { FrameDeliveryLimiter } from '../../src/main/terminal.ts';
import { createTerminalHost } from '../../src/run-host/terminal.ts';

const SESSION = 'live-session';
const AGENT = 'live-1';
const PERSONA = 'Coder 1';
const WINDOW = 1;

const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
const log = (m) => out({ log: m });
const shell = findShell();
if (!shell) { out({ fatal: 'no shell is present on this host (REQ-TOOLS-104)' }); process.exit(2); }
const clocks = nodeClocks();
const root = mkdtempSync(join(tmpdir(), 'rotaris-terminal-proof-'));
const env = Object.fromEntries(Object.entries(process.env).filter((e) => typeof e[1] === 'string'));

// The PTY factory loads node-pty once; the harness body runs after it (a CommonJS bundle has no top-level await).
const ptyFactory = nodePtyFactory();
const nodePtyFactoryOnce = () => ptyFactory;
async function main() {
const relay = new UpdateRelay();
let delivered = 0;
relay.attach({ id: WINDOW, send: (channel, payload) => { if (channel === CHANNEL.terminalFrames) { delivered += 1; out({ frame: payload, at: performance.now() }); } } });
relay.subscribe(WINDOW, SESSION);
const limiter = new FrameDeliveryLimiter({ relay, clocks, log: (m) => log(`limiter: ${m}`) });

/** The audit writer the real run host would reach through `Sessions.writer`: every entry is kept for the proof to read. */
const audits = [];
const sessions = { writer: () => ({ recordDecision: (entry) => { audits.push(entry); return { ok: true, value: undefined }; } }) };

const manager = new TerminalManager({ factory: await nodePtyFactoryOnce(), backend: shell, clocks, config: { ...TERMINAL_DEFAULTS, noOutputWindowMs: 15_000 }, env, warn: (m) => log(`warn: ${m}`) });
let settings = { enabled: true, intervalMs: 100, bufferKb: 256 };
const host = createTerminalHost({
  ready: Promise.resolve(manager),
  send: (m) => { if (m.event?.kind === 'publish.terminal') limiter.deliver(m.event.payload); },
  sessions,
  settings: () => settings,
  clocks,
  log: (m) => log(`run host: ${m}`),
});
const tool = terminalTool(manager, { ...TERMINAL_DEFAULTS, noOutputWindowMs: 15_000 });
const ctx = () => ({ workspaceRoot: root, sessionId: SESSION, agentName: AGENT, persona: PERSONA, monotonic: clocks.monotonic, wall: clocks.wall, signal: new AbortController().signal, warn: (m) => log(`ctx warn: ${m}`) });
const args = (a) => ({ command: '', is_input: false, reset: false, background: false, ...a });
const diag = (text) => { try { return JSON.parse(text.slice(text.indexOf('[terminal_diagnostic] ') + '[terminal_diagnostic] '.length)); } catch { return {}; } };
const output = (text) => { const m = /\[(?:partial_)?terminal_output\]\n([\s\S]*?)\n\[terminal_diagnostic\]/.exec(text); return m ? m[1] : ''; };

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let req;
  try { req = JSON.parse(line); } catch { return; }
  void handle(req).catch((e) => out({ id: req.id, error: String(e && e.stack ? e.stack : e) }));
});
async function handle(req) {
  switch (req.op) {
    case 'run': {
      const t0 = performance.now();
      out({ id: req.id, started: true, at: t0 });
      const r = await tool.execute(args({ command: req.command, ...(req.timeout === undefined ? {} : { timeout: req.timeout }) }), ctx());
      out({ id: req.id, done: true, result: { output: output(r.text), exitCode: diag(r.text)['exit_code'] ?? null, isError: r.isError, elapsedMs: Math.round(performance.now() - t0), text: r.text.length > 4000 ? `${r.text.slice(0, 4000)}…` : r.text } });
      return;
    }
    case 'terminal': {
      // The renderer's request, shape for shape, to the real run-host handler.
      const reply = await host.handle(req.request);
      out({ id: req.id, reply, at: performance.now() });
      return;
    }
    case 'deliver': {
      if (req.on) relay.subscribe(WINDOW, SESSION); else relay.unsubscribe(WINDOW, SESSION);
      out({ id: req.id, ok: true, delivering: req.on });
      return;
    }
    case 'settings': {
      settings = { ...settings, ...req.settings };
      out({ id: req.id, ok: true, settings });
      return;
    }
    case 'stats': {
      out({ id: req.id, delivered, limiter: limiter.stats(WINDOW), counters: manager.streams.counters, audits, streams: manager.streams.list(SESSION) });
      return;
    }
    case 'quit': {
      await manager.dispose();
      rmSync(root, { recursive: true, force: true });
      out({ id: req.id, ok: true });
      process.exit(0);
    }
    // eslint-disable-next-line no-fallthrough
    default:
      out({ id: req.id, error: `unknown op ${req.op}` });
  }
}
out({ ready: true, shell: shell.kind, root });
}
void main().catch((e) => { out({ fatal: String(e && e.stack ? e.stack : e) }); process.exit(3); });
