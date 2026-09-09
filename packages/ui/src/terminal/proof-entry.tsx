import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { err, ok } from '@rotaris/kernel';
import { CONTRACT_SCHEMA_VERSION, resolveTheme, type TerminalRefusal, type TranscriptRow } from '@rotaris/contracts';
import { applyTheme } from '../theme.js';
import { Row, TranscriptSurfaceProvider } from '../transcript/Row.js';
import type { Acknowledger } from '../TranscriptSurface.js';
import type { AuditEntry } from './audit.js';
import { readToken, toHex } from './colours.js';
import type { DisplayFrame } from './frames.js';
import { headlessEmulator } from './headless.js';
import { TerminalStreamSet } from './streams.js';
import { createTerminalWindowStreams, TerminalWindow, type TerminalActions } from './TerminalWindow.js';
import { isTerminalView } from './xterm-view.js';

/**
 * **Verification only** — `pnpm terminal-proof`'s page (ADR-0047's first execution, Part AM). The pop-out window's
 * content and a transcript row with the live preview, in one document, over a SCRIPTED frame source: the harness
 * (`apps/desktop/scripts/terminal-proof/main.cjs`) feeds frames through `window.__terminalProof.feed`, sends real key,
 * wheel and mouse events through Electron, and reads what it needs back through `window.__terminalProof.state`.
 * Nothing in the product reaches this file; the proof script bundles it on its own.
 *
 * Two registries, as in the product: the window's (`@xterm/xterm`, paints) and the main window's (`@xterm/headless`,
 * the preview) — both fed the same frames, which is REQ-SHELL-102's arrangement.
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
}

const log: ProofLog = { sendKeys: [], interrupt: [], endInput: [], kill: [], resize: [], audit: [], acks: [], clipboard: [], goToWorkspace: 0, openTerminal: [], wheel: [] };
const refusals = new Map<string, TerminalRefusal>();

const actions: TerminalActions = {
  sendKeys: async (streamId, keys) => { log.sendKeys.push({ streamId, keys: [...keys] }); const r = refusals.get(`sendKeys:${streamId}`); return r ? err(r) : ok(undefined); },
  interrupt: async (streamId) => { log.interrupt.push(streamId); const r = refusals.get(`interrupt:${streamId}`); return r ? err(r) : ok(undefined); },
  endInput: async (streamId) => { log.endInput.push(streamId); const r = refusals.get(`endInput:${streamId}`); return r ? err(r) : ok(undefined); },
  kill: async (streamId) => { log.kill.push(streamId); const r = refusals.get(`kill:${streamId}`); return r ? err(r) : ok(undefined); },
  resize: (streamId, cols, rows) => { log.resize.push({ streamId, cols, rows }); },
  audit: (streamId, entry) => { log.audit.push({ streamId, entry }); },
};
const acknowledge: Acknowledger = (kind, title, body) => { log.acks.push({ kind, title, body }); };
const clipboard = async (text: string) => { log.clipboard.push(text); };

const windowStreams = createTerminalWindowStreams();
const previewStreams = new TerminalStreamSet(headlessEmulator);

const ROW: TranscriptRow = {
  index: 7, kind: 'tool', persona: 'coding-agent', name: 'Coder 1', body: 'terminal pytest -q tests/billing', toolName: 'terminal', toolStatus: 'running', settled: false,
  callKey: 'call-term', startedAt: '2026-09-09T09:00:00.000Z', at: '2026-09-09T09:00:00.000Z', ts: '09:00:00', input: '{ "command": "pytest -q tests/billing" }', output: '',
  streamId: 'fg:coder-1',
};

function Preview({ version }: { version: number }) {
  const display = useMemo(() => ({ shape: 'row' as const, key: 'call-term', row: ROW }), []);
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
  useEffect(() => {
    const w = window as unknown as { __terminalProofBump?: () => void; __terminalProofFocus?: (id: string | null) => void };
    w.__terminalProofBump = () => setVersion((v) => v + 1);
    w.__terminalProofFocus = (id) => setFocusStream(id);
  }, []);
  return (
    <div className="terminal-proof" data-testid="terminal-proof">
      <div className="terminal-proof__window" style={{ width: 900, height: 620 }} data-testid="proof-window">
        <TerminalWindow streams={windowStreams} actions={actions} onGoToWorkspace={() => { log.goToWorkspace += 1; }} focusStream={focusStream} acknowledge={acknowledge} clipboard={clipboard} />
      </div>
      <div className="terminal-proof__transcript" style={{ width: 640 }}>
        <button type="button" className="btn btn-secondary" data-testid="proof-before-grid">A control before the grid</button>
        <Preview version={version} />
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
  };
}

const api = {
  feed(frames: Omit<DisplayFrame, 'v'>[]) {
    for (const f of frames) { const frame: DisplayFrame = { ...f, v: CONTRACT_SCHEMA_VERSION }; windowStreams.apply(frame); previewStreams.apply(frame); }
    (window as unknown as { __terminalProofBump?: () => void }).__terminalProofBump?.();
  },
  clear() { windowStreams.clear(); previewStreams.clear(); },
  refuse(action: string, streamId: string, refusal: TerminalRefusal | null) { if (refusal === null) refusals.delete(`${action}:${streamId}`); else refusals.set(`${action}:${streamId}`, refusal); },
  theme(name: string) { applyTheme(resolveTheme(name), document.documentElement); },
  font(sizePx: number | null) { if (sizePx === null) document.documentElement.style.removeProperty('--rt-text-sm'); else document.documentElement.style.setProperty('--rt-text-sm', `${sizePx}px`); },
  focusStream(id: string | null) { (window as unknown as { __terminalProofFocus?: (id: string | null) => void }).__terminalProofFocus?.(id); },
  bump() { (window as unknown as { __terminalProofBump?: () => void }).__terminalProofBump?.(); },
  listed() { return windowStreams.list().map((d) => ({ id: d.streamId, view: isTerminalView(d.emulator), running: d.meta.running })); },
  clearSelection(streamId: string) { const w = windowStreams.get(streamId); if (w && isTerminalView(w.emulator)) w.emulator.clearSelection(); },
  state(streamId: string) {
    return {
      log: JSON.parse(JSON.stringify(log)) as ProofLog,
      stream: frameSummary(streamId),
      termBg: toHex(readToken(document.documentElement, '--rt-term-bg')),
      theme: document.documentElement.dataset['theme'] ?? null,
      fontsReady: document.fonts.status,
    };
  },
  ready: true,
};
(window as unknown as { __terminalProof: typeof api }).__terminalProof = api;
window.addEventListener('wheel', (event) => { log.wheel.push({ deltaY: event.deltaY, deltaMode: event.deltaMode }); }, { capture: true, passive: true });

applyTheme(resolveTheme('rotaris-dim'), document.documentElement);
createRoot(document.getElementById('root')!).render(<ProofPage />);
