import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { foregroundStreamId, type TerminalFrame } from '@rotaris/contracts';
import { nodeClocks } from '@rotaris/platform';
import { findShell, nodePtyFactory, TerminalManager, terminalTool, TERMINAL_DEFAULTS, type ToolContext } from '@rotaris/agent-tools';
import { headlessEmulator, parsed, TerminalStreamSet } from '@rotaris/ui';

/**
 * Live-run L9, second round (REQ-TOOLS-127, REQ-SHELL-104) — the run host's REAL foreground stream, behind the host's
 * REAL shell through a REAL PTY, applied to the renderer's REAL display (`TerminalStreamSet` over `@xterm/headless`,
 * the transcript preview's adapter). Main sits between the two halves and relays frames unchanged, so this is the chain
 * a window draws, less the transport.
 *
 * Since L9's repair the stream carries only what a command wrote, so the next command's first delta on a re-opened
 * `fg:<agent>` stream is its own first line. The closing frame before it is the observation's text, its trailing
 * newline trimmed, and the display's literal replacement leaves the cursor after that text: before the display's
 * repair, the second command's first line was drawn onto the first command's last row (`first-cmdsecond-cmd`), which
 * the verifier measured on the branch and the live run's `terminal.early.png` showed (`/usr/bin/bashroot@vm:…#`).
 * With ROTARIS_TERMINAL_PROOF_DIR set the measurement goes to `pnpm terminal-stream-proof`.
 */
const shell = findShell();
const PS = shell?.kind === 'powershell';
const echo = (text: string) => (PS ? `Write-Output ${text}` : `printf '%s\\n' ${text}`);
const clocks = nodeClocks();
const root = mkdtempSync(join(tmpdir(), 'rotaris-display-'));
const proofDir = process.env['ROTARIS_TERMINAL_PROOF_DIR'];
const env = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'));
const managers: TerminalManager[] = [];
const measurements: Record<string, unknown> = {};
const ctx = (): ToolContext => ({ workspaceRoot: root, sessionId: 'sess-1', agentName: 'orchestrator', persona: 'orchestrator', monotonic: clocks.monotonic, wall: clocks.wall, signal: new AbortController().signal, warn: () => undefined });
const args = (command: string) => ({ command, is_input: false, reset: false, background: false }) as Parameters<ReturnType<typeof terminalTool>['execute']>[0];

afterAll(async () => {
  await Promise.all(managers.map((m) => m.dispose()));
  rmSync(root, { recursive: true, force: true });
  if (proofDir) {
    mkdirSync(proofDir, { recursive: true });
    const file = join(proofDir, 'measurements.json');
    const prior = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : {};
    writeFileSync(file, JSON.stringify({ ...prior, ...measurements }, null, 2));
  }
});

describe.skipIf(!shell)('the display of a re-opened foreground stream (live-run L9; REQ-TOOLS-127, REQ-SHELL-104)', () => {
  it('REQ-TOOLS-127 (live-run L9): a second command on the same stream starts on its own row in the display, never glued to the first command\'s last line', async () => {
    const m = new TerminalManager({ factory: await nodePtyFactory(), backend: shell!, clocks, config: { ...TERMINAL_DEFAULTS }, env, warn: () => undefined });
    managers.push(m);
    const tool = terminalTool(m, TERMINAL_DEFAULTS);
    const frames: TerminalFrame[] = [];
    m.streams.onFrame((f) => frames.push(f));
    const c = ctx();
    const first = await tool.execute(args(echo('first-cmd')), c);
    const second = await tool.execute(args(echo('second-cmd')), c);
    expect(first.isError).toBe(false);
    expect(second.isError).toBe(false);
    const own = frames.filter((f) => f.streamId === foregroundStreamId('orchestrator'));
    const closings = own.map((f, i) => (f.kind === 'screen' && f.closing ? i : -1)).filter((i) => i >= 0);
    expect(closings).toHaveLength(2);
    // The instant a live display shows while the second command runs: every frame up to its closing one, applied in order.
    const running = new TerminalStreamSet(headlessEmulator);
    for (const f of own.slice(0, closings[1])) running.apply(f);
    await parsed(running.get(foregroundStreamId('orchestrator'))!.emulator);
    const whileRunning = running.previewOf(foregroundStreamId('orchestrator'))!.lines;
    // And the finished display: the second command's closing text replaces the screen.
    const finished = new TerminalStreamSet(headlessEmulator);
    for (const f of own) finished.apply(f);
    await parsed(finished.get(foregroundStreamId('orchestrator'))!.emulator);
    const afterClosing = finished.previewOf(foregroundStreamId('orchestrator'))!.lines;
    measurements['reopenedStream'] = { whileRunning, afterClosing, freshRow: whileRunning.join('\n') === 'first-cmd\nsecond-cmd' };
    expect(whileRunning).toEqual(['first-cmd', 'second-cmd']);
    expect(afterClosing).toEqual(['second-cmd']);
  });
});
