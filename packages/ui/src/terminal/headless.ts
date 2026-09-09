import { Terminal } from '@xterm/headless';
import type { EmulatorFactory, ScreenEmulator, ScreenSnapshot } from './emulator.js';

/**
 * Part AM — the `@xterm/headless` adapter of the emulator port: the parser and the screen model with no DOM, for the
 * transcript preview (REQ-CHAT-063/066/076, REQ-SHELL-079) and for the tests. The same parser the grid's `@xterm/xterm`
 * runs, so the two surfaces agree by construction of their input (ADR-0021's recommendation).
 */
const SCROLLBACK = 5_000;
/** Full reset (ESC c), which xterm honours as `reset()` from inside the parser. */
export const RIS = '\x1bc';

class HeadlessEmulator implements ScreenEmulator {
  private readonly terminal: Terminal;
  constructor(cols: number, rows: number) {
    this.terminal = new Terminal({ cols, rows, scrollback: SCROLLBACK, allowProposedApi: true });
  }
  get cols(): number { return this.terminal.cols; }
  get rows(): number { return this.terminal.rows; }
  write(data: string, parsed?: () => void): void { this.terminal.write(data, parsed); }
  // RIS through the queue, not `terminal.reset()` now: a delta still queued would otherwise be parsed onto the reset screen.
  reset(): void { this.terminal.write(RIS); }
  resize(cols: number, rows: number): void { this.terminal.resize(cols, rows); }
  snapshot(): ScreenSnapshot { return snapshotOf(this.terminal); }
  readCells(row: number, fromColumn: number, toColumn: number): string {
    return this.terminal.buffer.active.getLine(row)?.translateToString(false, fromColumn, toColumn) ?? '';
  }
  dispose(): void { this.terminal.dispose(); }
}

/** Shared by both adapters: xterm's public buffer API is the same in the browser and headless builds. */
export function snapshotOf(terminal: Pick<Terminal, 'buffer' | 'cols' | 'rows'>): ScreenSnapshot {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];
  for (let y = 0; y < terminal.rows; y += 1) lines.push(buffer.getLine(buffer.viewportY + y)?.translateToString(true) ?? '');
  const core = (terminal as unknown as { _core?: { coreService?: { isCursorHidden?: boolean } } })._core;
  return {
    cols: terminal.cols, rows: terminal.rows, lines,
    cursor: { x: buffer.cursorX, y: buffer.cursorY },
    historyRows: buffer.baseY, viewportY: buffer.viewportY, atTail: buffer.viewportY === buffer.baseY,
    alternate: buffer.type === 'alternate',
    // DECTCEM is not on the public `modes` surface; the core service's flag is read defensively (a missing field reads as shown).
    cursorHidden: core?.coreService?.isCursorHidden === true,
  };
}

export const headlessEmulator: EmulatorFactory = (cols, rows) => new HeadlessEmulator(cols, rows);

/** Resolves once everything written so far has been parsed. */
export function parsed(emulator: ScreenEmulator): Promise<void> {
  return new Promise((resolve) => emulator.write('', resolve));
}
