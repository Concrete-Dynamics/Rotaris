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
  /**
   * Every keydown and every mouseup the window received, counted in the capture phase. The harness waits on these after
   * each key and click instead of on a fixed pause, because the page handles an event in the same dispatch that counts
   * it: on a loaded host a fixed pause read the state before the event had arrived
   * (`docs/defects/fixed/terminal-proofs-input-checks-fail-at-random-on-a-heavily-loaded-host.md`).
   */
  keydowns: number;
  pointerUps: number;
  /** Live mode: every outcome the bridge answered, with the request kind. */
  outcomes: { kind: string; ok: boolean; code?: string | undefined }[];
}
interface ProofBridge {
  onFrame(fn: (frame: DisplayFrame) => void): void;
  command(request: Record<string, unknown>): Promise<CommandOutcome>;
}
/**
 * REQ-SHELL-166's echo, in the page's own clock: `pressedAt` when the page's keydown listener ran, `frameAt` when the frame
 * carrying the sentinel arrived, `paintedAt` in the animation frame after the grid parsed it. `eventAt` is the event's
 * own time stamp, so `pressedAt - eventAt` is how long the key waited in the renderer's queue before it was handled —
 * a figure that is the host's, recorded beside the bound rather than inside it.
 */
interface EchoProbe { sentinel: string; eventAt: number | null; pressedAt: number | null; frameAt: number | null; paintedAt: number | null }

/**
 * REQ-SHELL-102, REQ-CHAT-063/076: the row preview and the persona card's preview sampled from a closing `screen` frame's
 * arrival until every surface has parsed it — at once, then on every task the page gets — counting the samples whose
 * lines were empty. The window is where a reset that had parsed before the final text read `[]`
 * (`docs/defects/fixed/a-closing-terminal-frame-blanks-the-preview-while-the-final-screen-is-parsed.md`).
 */
interface PreviewWatch {
  streamId: string;
  closingFrames: number;
  samples: number;
  emptyPreview: number;
  emptyPersona: number;
  firstEmpty: { readonly frame: number; readonly sample: number; readonly preview: readonly string[] | null; readonly persona: readonly string[] | null } | null;
  /** Each closing frame's samples and the preview's line count at the first and the last of them. */
  frames: { samples: number; firstLines: number; lastLines: number; settled: boolean }[];
}
let previewWatch: PreviewWatch | null = null;

const log: ProofLog = { sendKeys: [], interrupt: [], endInput: [], kill: [], resize: [], audit: [], acks: [], clipboard: [], goToWorkspace: 0, openTerminal: [], wheel: [], keydowns: 0, pointerUps: 0, outcomes: [] };
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

function watchClosingFrame(watch: PreviewWatch): void {
  const streamId = watch.streamId;
  const index = watch.closingFrames;
  watch.closingFrames += 1;
  const record = { samples: 0, firstLines: -1, lastLines: -1, settled: false };
  watch.frames.push(record);
  const sample = (): void => {
    const preview = previewStreams.previewOf(streamId)?.lines ?? null;
    const persona = personaStreams.previewOf(streamId)?.lines ?? null;
    watch.samples += 1;
    record.samples += 1;
    const lines = preview === null ? 0 : preview.length;
    if (record.firstLines < 0) record.firstLines = lines;
    record.lastLines = lines;
    const previewEmpty = preview === null || preview.length === 0;
    const personaEmpty = persona === null || persona.length === 0;
    if (previewEmpty) watch.emptyPreview += 1;
    if (personaEmpty) watch.emptyPersona += 1;
    if ((previewEmpty || personaEmpty) && watch.firstEmpty === null) watch.firstEmpty = { frame: index, sample: record.samples, preview, persona };
  };
  sample();
  let done = false;
  void api.settled(streamId).then(() => { done = true; sample(); record.settled = true; });
  const tick = (): void => { if (done) return; sample(); setTimeout(tick, 0); };
  setTimeout(tick, 0);
}

function applyEverywhere(frame: DisplayFrame): void {
  windowStreams.apply(frame);
  previewStreams.apply(frame);
  personaStreams.apply(frame);
  if (previewWatch && frame.streamId === previewWatch.streamId && frame.kind === 'screen' && frame.closing === true) watchClosingFrame(previewWatch);
  // REQ-SHELL-166's echo: the frame that carries the sentinel, then the paint after the grid parsed it.
  if (echo && echo.frameAt === null && frame.kind === 'delta' && frame.payload.includes(echo.sentinel)) {
    const probe = echo;
    probe.frameAt = performance.now();
    const w = windowStreams.get(frame.streamId);
    w?.emulator.write('', () => requestAnimationFrame(() => { probe.paintedAt = performance.now(); }));
  }
}
if (bridge) bridge.onFrame((frame) => { applyEverywhere(frame); (window as unknown as { __terminalProofBump?: () => void }).__terminalProofBump?.(); });
window.addEventListener('keydown', (event) => { log.keydowns += 1; if (echo && echo.pressedAt === null && event.key === echo.sentinel) { echo.pressedAt = performance.now(); echo.eventAt = event.timeStamp; } }, { capture: true });
window.addEventListener('mouseup', () => { log.pointerUps += 1; }, { capture: true });

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
  echoProbe(sentinel: string | null) { echo = sentinel === null ? null : { sentinel, eventAt: null, pressedAt: null, frameAt: null, paintedAt: null }; },
  /**
   * Resolves once the window's grid and both previews have parsed every write queued for `streamId`. A closing `screen`
   * frame resets each emulator and writes the whole final screen again, which the library parses over several tasks, so a
   * read taken between the reset and the end of that parse sees a partial screen.
   */
  settled(streamId: string) {
    const parsed = (emulator: { write(data: string, parsed?: () => void): void }) => new Promise<boolean>((resolve) => { emulator.write('', () => resolve(true)); });
    const displays = [windowStreams.get(streamId), previewStreams.get(streamId), personaStreams.get(streamId)].filter((d) => d !== null && d !== undefined);
    return Promise.all(displays.map((d) => parsed(d.emulator))).then(() => true);
  },
  /** Starts (or, with `null`, stops) sampling the two previews through each closing frame's parse; `previewWatched` reads it. */
  watchPreviews(streamId: string | null) {
    previewWatch = streamId === null ? null : { streamId, closingFrames: 0, samples: 0, emptyPreview: 0, emptyPersona: 0, firstEmpty: null, frames: [] };
  },
  previewWatched() { return previewWatch === null ? null : JSON.parse(JSON.stringify(previewWatch)) as PreviewWatch; },
  /** What the input fences read: cheaper than `state`, which copies the whole log. */
  inputs() { return { keydowns: log.keydowns, pointerUps: log.pointerUps, wheels: log.wheel.length }; },
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
