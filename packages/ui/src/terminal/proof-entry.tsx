import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { err, ok } from '@rotaris/kernel';
import { CONTRACT_SCHEMA_VERSION, resolveTheme, TERMINAL_REFUSALS, type CommandOutcome, type TerminalRefusal, type TranscriptRow } from '@rotaris/contracts';
import { applyTheme } from '../theme.js';
import { Row, TranscriptSurfaceProvider } from '../transcript/Row.js';
import type { Acknowledger } from '../TranscriptSurface.js';
import type { AuditEntry } from './audit.js';
import { readToken, toHex } from './colours.js';
import type { DisplayFrame } from './frames.js';
import { headlessEmulator } from './headless.js';
import { TerminalStreamSet } from './streams.js';
import { createTerminalWindowStreams, TerminalWindow, type TerminalActionResult, type TerminalActions } from './TerminalWindow.js';
import { isTerminalView } from './xterm-view.js';
import { Button as DesignButton } from '../design-system/index.js';

/**
 * **Verification only** — `pnpm terminal-proof`'s page (ADR-0047's first execution, Part AM; its second, Part AL2). The
 * pop-out window's content and a transcript row with the live preview, in one document. Two sources feed it:
 *
 *  - the SCRIPTED source of Part AM: the harness (`apps/desktop/scripts/terminal-proof/main.cjs`) feeds frames through
 *    `window.__terminalProof.feed`, sends real key, wheel and mouse events through Electron, and reads what it needs back
 *    through `window.__terminalProof.state`; the actions are logged fakes with scripted refusals;
 *  - Part AL2's LIVE source for REQ-SHELL-166: frames arrive from a real PTY through the proof's preload bridge
 *    (`__terminalProofBridge.onFrame`, the run host's registry → main's limiter → this window, as in the product), and
 *    while `live` is set the actions travel back as the product's own `terminal.*` requests (`bridge.command`).
 *
 * Three registries, as in the product: the window's (`@xterm/xterm`, paints), the main window's (`@xterm/headless`,
 * the row preview) and the persona window's (`@xterm/headless`, the transcript card's preview — the same class the
 * persona renderer constructs and the same `previewOf` it hands the card) — all fed the same frames from the same
 * point, which is REQ-SHELL-102's arrangement and REQ-SHELL-075 (b)'s parity. Nothing in the product reaches this file.
 */
interface ProofLog {
  sendKeys: { streamId: string; keys: unknown[] }[];
  interrupt: string[];
  endInput: string[];
  kill: string[];
  resize: { streamId: string; cols: number; rows: number }[];
  audit: { streamId: string; entry: AuditEntry }[];
  acks: { kind: string; title: string; body?: string | undefined }[];
  clipboard: string[];
  goToWorkspace: number;
  openTerminal: string[];
  wheel: { deltaY: number; deltaMode: number }[];
  /** Live mode: every outcome the bridge answered, with the request kind. */
  outcomes: { kind: string; ok: boolean; code?: string | undefined }[];
}
interface ProofBridge {
  onFrame(fn: (frame: DisplayFrame) => void): void;
  command(request: Record<string, unknown>): Promise<CommandOutcome>;
}
interface EchoProbe { sentinel: string; pressedAt: number | null; frameAt: number | null; paintedAt: number | null }

const log: ProofLog = { sendKeys: [], interrupt: [], endInput: [], kill: [], resize: [], audit: [], acks: [], clipboard: [], goToWorkspace: 0, openTerminal: [], wheel: [], outcomes: [] };
const refusals = new Map<string, TerminalRefusal>();
const bridge = (window as unknown as { __terminalProofBridge?: ProofBridge }).__terminalProofBridge ?? null;
let live = false;
let echo: EchoProbe | null = null;

const refusalOf = (r: CommandOutcome): TerminalRefusal => {
  if (r.ok) return 'unknown-stream';
  const code = r.code.startsWith('terminal.') ? r.code.slice('terminal.'.length) : r.code;
  return (TERMINAL_REFUSALS as readonly string[]).includes(code) ? (code as TerminalRefusal) : 'unknown-stream';
};
/** Live: the product's request to the bridge; scripted: the logged fake with its scripted refusal. */
async function act(name: string, streamId: string, request: Record<string, unknown>): TerminalActionResult {
  if (live && bridge) {
    const r = await bridge.command(request);
    log.outcomes.push({ kind: String(request['kind']), ok: r.ok, code: r.ok ? undefined : r.code });
    return r.ok ? ok(undefined) : err(refusalOf(r));
  }
  const r = refusals.get(`${name}:${streamId}`);
  return r ? err(r) : ok(undefined);
}
const actions: TerminalActions = {
  sendKeys: (streamId, keys) => { log.sendKeys.push({ streamId, keys: [...keys] }); return act('sendKeys', streamId, { kind: 'terminal.sendKeys', streamId, keys: [...keys] }); },
  interrupt: (streamId) => { log.interrupt.push(streamId); return act('interrupt', streamId, { kind: 'terminal.interrupt', streamId }); },
  endInput: (streamId) => { log.endInput.push(streamId); return act('endInput', streamId, { kind: 'terminal.endInput', streamId }); },
  kill: (streamId) => { log.kill.push(streamId); return act('kill', streamId, { kind: 'terminal.kill', streamId }); },
  resize: (streamId, cols, rows) => { log.resize.push({ streamId, cols, rows }); if (live && bridge) return bridge.command({ kind: 'terminal.resize', streamId, cols, rows }); return undefined; },
  audit: (streamId, entry) => { log.audit.push({ streamId, entry }); if (live && bridge) void bridge.command({ kind: 'terminal.audit', streamId, entry }); },
};
const acknowledge: Acknowledger = (kind, title, body) => { log.acks.push({ kind, title, body }); };
const clipboard = async (text: string) => { log.clipboard.push(text); };

const windowStreams = createTerminalWindowStreams();
const previewStreams = new TerminalStreamSet(headlessEmulator);
const personaStreams = new TerminalStreamSet(headlessEmulator);

function rowFor(streamId: string): TranscriptRow {
  return {
    index: 7, kind: 'tool', persona: 'coding-agent', name: 'Coder 1', body: 'terminal pytest -q tests/billing', toolName: 'terminal', toolStatus: 'running', settled: false,
    callKey: 'call-term', startedAt: '2026-09-09T09:00:00.000Z', at: '2026-09-09T09:00:00.000Z', ts: '09:00:00', input: '{ "command": "pytest -q tests/billing" }', output: '',
    streamId,
  };
}

function Preview({ version, streamId }: { version: number; streamId: string }) {
  const display = useMemo(() => ({ shape: 'row' as const, key: 'call-term', row: rowFor(streamId) }), [streamId]);
  return (
    <TranscriptSurfaceProvider value={{ showReasoning: false, autoCollapseTools: false, runActive: true, nowMs: version, openTerminal: (id) => { log.openTerminal.push(id); }, terminalPreview: (id) => previewStreams.previewOf(id) }}>
      <div className="transcript" data-testid="proof-transcript">
        <Row display={display} expanded={false} onToggle={() => undefined} match={null} />
      </div>
    </TranscriptSurfaceProvider>
  );
}

function ProofPage() {
  const [version, setVersion] = useState(0);
  const [focusStream, setFocusStream] = useState<string | null>(null);
  const [rowStream, setRowStream] = useState('fg:coder-1');
  useEffect(() => {
    const w = window as unknown as { __terminalProofBump?: () => void; __terminalProofFocus?: (id: string | null) => void; __terminalProofRow?: (id: string) => void };
    w.__terminalProofBump = () => setVersion((v) => v + 1);
    w.__terminalProofFocus = (id) => setFocusStream(id);
    w.__terminalProofRow = (id) => setRowStream(id);
  }, []);
  return (
    <div className="terminal-proof" data-testid="terminal-proof">
      <div className="terminal-proof__window" style={{ width: 900, height: 620 }} data-testid="proof-window">
        <TerminalWindow streams={windowStreams} actions={actions} onGoToWorkspace={() => { log.goToWorkspace += 1; }} focusStream={focusStream} acknowledge={acknowledge} clipboard={clipboard} />
      </div>
      <div className="terminal-proof__transcript" style={{ width: 640 }}>
        <DesignButton type="button" className="btn btn-secondary" data-testid="proof-before-grid">A control before the grid</DesignButton>
        <Preview version={version} streamId={rowStream} />
      </div>
    </div>
  );
}

function frameSummary(streamId: string) {
  const w = windowStreams.get(streamId);
  const view = w && isTerminalView(w.emulator) ? w.emulator : null;
  const snap = w?.emulator.snapshot() ?? null;
  return {
    exists: w !== null && w !== undefined,
    meta: w?.meta ?? null,
    grid: snap ? { ...snap, cell: view?.cellSize() ?? null, hasSelection: view?.hasSelection() ?? false, selectionText: view?.selectionText() ?? '', selectionRange: view?.terminal.getSelectionPosition() ?? null, domRows: view?.container.querySelectorAll('.xterm-rows > div').length ?? 0 } : null,
    preview: previewStreams.previewOf(streamId),
    persona: personaStreams.previewOf(streamId),
    previewMeta: previewStreams.get(streamId)?.meta ?? null,
    personaMeta: personaStreams.get(streamId)?.meta ?? null,
  };
}

function applyEverywhere(frame: DisplayFrame): void {
  windowStreams.apply(frame);
  previewStreams.apply(frame);
  personaStreams.apply(frame);
  // REQ-SHELL-166's echo: the frame that carries the sentinel, then the paint after the grid parsed it.
  if (echo && echo.frameAt === null && frame.kind === 'delta' && frame.payload.includes(echo.sentinel)) {
    const probe = echo;
    probe.frameAt = performance.now();
    const w = windowStreams.get(frame.streamId);
    w?.emulator.write('', () => requestAnimationFrame(() => { probe.paintedAt = performance.now(); }));
  }
}
if (bridge) bridge.onFrame((frame) => { applyEverywhere(frame); (window as unknown as { __terminalProofBump?: () => void }).__terminalProofBump?.(); });
window.addEventListener('keydown', (event) => { if (echo && echo.pressedAt === null && event.key === echo.sentinel) echo.pressedAt = performance.now(); }, { capture: true });

const api = {
  feed(frames: Omit<DisplayFrame, 'v'>[]) {
    for (const f of frames) applyEverywhere({ ...f, v: CONTRACT_SCHEMA_VERSION });
    (window as unknown as { __terminalProofBump?: () => void }).__terminalProofBump?.();
  },
  clear() { windowStreams.clear(); previewStreams.clear(); personaStreams.clear(); },
  refuse(action: string, streamId: string, refusal: TerminalRefusal | null) { if (refusal === null) refusals.delete(`${action}:${streamId}`); else refusals.set(`${action}:${streamId}`, refusal); },
  theme(name: string) { applyTheme(resolveTheme(name), document.documentElement); },
  font(sizePx: number | null) { if (sizePx === null) document.documentElement.style.removeProperty('--rt-text-sm'); else document.documentElement.style.setProperty('--rt-text-sm', `${sizePx}px`); },
  focusStream(id: string | null) { (window as unknown as { __terminalProofFocus?: (id: string | null) => void }).__terminalProofFocus?.(id); },
  bump() { (window as unknown as { __terminalProofBump?: () => void }).__terminalProofBump?.(); },
  listed() { return windowStreams.list().map((d) => ({ id: d.streamId, view: isTerminalView(d.emulator), running: d.meta.running })); },
  clearSelection(streamId: string) { const w = windowStreams.get(streamId); if (w && isTerminalView(w.emulator)) w.emulator.clearSelection(); },
  /** Part AL2: the live section — the actions go to the bridge, the row previews this stream. */
  live(streamId: string | null) {
    live = streamId !== null;
    if (streamId !== null) (window as unknown as { __terminalProofRow?: (id: string) => void }).__terminalProofRow?.(streamId);
  },
  echoProbe(sentinel: string | null) { echo = sentinel === null ? null : { sentinel, pressedAt: null, frameAt: null, paintedAt: null }; },
  state(streamId: string) {
    return {
      log: JSON.parse(JSON.stringify(log)) as ProofLog,
      stream: frameSummary(streamId),
      termBg: toHex(readToken(document.documentElement, '--rt-term-bg')),
      theme: document.documentElement.dataset['theme'] ?? null,
      fontsReady: document.fonts.status,
      live,
      bridged: bridge !== null,
      echo,
    };
  },
  ready: true,
};
(window as unknown as { __terminalProof: typeof api }).__terminalProof = api;
window.addEventListener('wheel', (event) => { log.wheel.push({ deltaY: event.deltaY, deltaMode: event.deltaMode }); }, { capture: true, passive: true });

applyTheme(resolveTheme('rotaris-dim'), document.documentElement);
createRoot(document.getElementById('root')!).render(<ProofPage />);
