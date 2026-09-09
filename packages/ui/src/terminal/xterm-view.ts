import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { EmulatorFactory, ScreenEmulator, ScreenSnapshot } from './emulator.js';
import { RIS, snapshotOf } from './headless.js';
import { extractSelection } from './selection.js';
import type { TerminalColours, TerminalFont } from './colours.js';
import type { ScrollTarget } from './keys.js';

/**
 * Part AM — the `@xterm/xterm` adapter of the emulator port, for the grid (ADR-0047 B: the library as a SCREEN, the
 * product owning input). One `Terminal` per stream is both the screen model and the renderer for that stream's life
 * in this renderer; it is opened once into a container this adapter owns and the grid attaches or detaches that
 * container as the tab comes to the front or leaves it. xterm pauses its own rendering while the screen element does
 * not intersect the viewport, so a tab that is not in front performs no repaint (REQ-SHELL-084/151) while its buffer
 * keeps consuming frames.
 *
 * What is deliberately switched off, and why (ADR-0047 consequence 1 — kept from drifting back by the proof):
 *  - the custom key handler returns `false` for EVERY key, so the library never handles a keystroke; the grid's
 *    handler implements REQ-SHELL-097 and the encoder REQ-SHELL-096;
 *  - nothing subscribes to `onData` — no byte the library would emit can reach a process;
 *  - the wheel is taken in the capture phase by the grid before the library's viewport sees it (REQ-SHELL-101);
 *  - the library's cursor is themed invisible; the grid draws REQ-SHELL-098's cursor.
 */
export interface CellSize { readonly width: number; readonly height: number }
export interface CursorBox { readonly left: number; readonly top: number; readonly width: number; readonly height: number }

export interface TerminalView extends ScreenEmulator {
  readonly terminal: Terminal;
  readonly container: HTMLDivElement;
  readonly attached: boolean;
  attach(host: HTMLElement): void;
  detach(): void;
  focus(): void;
  scrollRows(rows: number): void;
  scrollTo(target: ScrollTarget): void;
  applyTheme(colours: TerminalColours, font: TerminalFont): void;
  /** The rendered cell, read from the DOM the library painted; `null` before the first paint. */
  cellSize(): CellSize | null;
  /** Where the grid paints the cursor, relative to the container; `null` when it is off the viewport or hidden by the program. */
  cursorBox(): CursorBox | null;
  hasSelection(): boolean;
  /** REQ-SHELL-101: whole cells, direction-independent, right-trimmed, newline-joined — extracted here, painted by the library. */
  selectionText(): string;
  clearSelection(): void;
  /** The whole screen and its retained history as text, for "Copy all" (REQ-SHELL-088). */
  allText(): string;
  /** Fires on render, scroll, selection change and cursor move — the grid repaints its overlay on it. */
  subscribe(listener: () => void): () => void;
}

const SCROLLBACK = 5_000;

class XtermView implements TerminalView {
  readonly terminal: Terminal;
  readonly container: HTMLDivElement;
  private opened = false;
  private host: HTMLElement | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(cols: number, rows: number) {
    this.terminal = new Terminal({
      cols, rows, scrollback: SCROLLBACK, allowProposedApi: true,
      cursorBlink: false, cursorStyle: 'block', cursorInactiveStyle: 'none',
      disableStdin: true, convertEol: false, scrollOnUserInput: false,
    });
    // Every key is ours (REQ-SHELL-097); the library handles none.
    this.terminal.attachCustomKeyEventHandler(() => false);
    this.container = document.createElement('div');
    this.container.className = 'term-grid__screen';
    const notify = () => { for (const l of this.listeners) l(); };
    this.terminal.onRender(notify);
    this.terminal.onScroll(notify);
    this.terminal.onSelectionChange(notify);
    this.terminal.onCursorMove(notify);
    this.terminal.onResize(notify);
  }

  get cols(): number { return this.terminal.cols; }
  get rows(): number { return this.terminal.rows; }
  get attached(): boolean { return this.host !== null; }

  write(data: string, parsed?: () => void): void { this.terminal.write(data, parsed); }
  reset(): void { this.terminal.write(RIS); }
  resize(cols: number, rows: number): void { if (cols !== this.terminal.cols || rows !== this.terminal.rows) this.terminal.resize(cols, rows); }
  snapshot(): ScreenSnapshot { return snapshotOf(this.terminal); }
  readCells(row: number, fromColumn: number, toColumn: number): string {
    return this.terminal.buffer.active.getLine(row)?.translateToString(false, fromColumn, toColumn) ?? '';
  }
  dispose(): void { this.detach(); this.terminal.dispose(); this.listeners.clear(); }

  attach(host: HTMLElement): void {
    if (this.host === host) return;
    this.detach();
    host.append(this.container);
    this.host = host;
    if (!this.opened) { this.terminal.open(this.container); this.opened = true; }
    else this.terminal.refresh(0, this.terminal.rows - 1);
  }
  detach(): void {
    if (this.host === null) return;
    this.container.remove();
    this.host = null;
  }
  focus(): void { this.terminal.focus(); }
  scrollRows(rows: number): void { if (rows !== 0) this.terminal.scrollLines(rows); }
  scrollTo(target: ScrollTarget): void {
    if (target === 'top') this.terminal.scrollToTop();
    else if (target === 'bottom') this.terminal.scrollToBottom();
    else this.terminal.scrollPages(target === 'page-up' ? -1 : 1);
  }
  applyTheme(colours: TerminalColours, font: TerminalFont): void {
    this.terminal.options.theme = { ...colours };
    this.terminal.options.fontFamily = font.family;
    this.terminal.options.fontSize = font.sizePx;
  }
  cellSize(): CellSize | null {
    const rows = this.container.querySelector<HTMLElement>('.xterm-rows');
    const first = rows?.firstElementChild as HTMLElement | null | undefined;
    if (!rows || !first) return null;
    const width = rows.getBoundingClientRect().width / Math.max(1, this.terminal.cols);
    const height = first.getBoundingClientRect().height;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  cursorBox(): CursorBox | null {
    const snap = this.snapshot();
    if (snap.cursorHidden) return null;
    const rowInView = snap.historyRows + snap.cursor.y - snap.viewportY;
    if (rowInView < 0 || rowInView >= snap.rows) return null;
    const cell = this.cellSize();
    if (!cell) return null;
    const rows = this.container.querySelector<HTMLElement>('.xterm-rows');
    const rowElement = rows?.children[rowInView] as HTMLElement | undefined;
    const base = this.container.getBoundingClientRect();
    const rowRect = rowElement?.getBoundingClientRect();
    const top = rowRect ? rowRect.top - base.top : rowInView * cell.height;
    const left = (rows?.getBoundingClientRect().left ?? base.left) - base.left + snap.cursor.x * cell.width;
    return { left, top, width: cell.width, height: cell.height };
  }
  hasSelection(): boolean { return this.terminal.hasSelection(); }
  selectionText(): string {
    const range = this.terminal.getSelectionPosition();
    if (!range) return '';
    return extractSelection((row, from, to) => this.readCells(row, from, to), { start: { x: range.start.x, y: range.start.y }, end: { x: range.end.x, y: range.end.y } }, this.terminal.cols);
  }
  clearSelection(): void { this.terminal.clearSelection(); }
  allText(): string {
    const buffer = this.terminal.buffer.active;
    const lines: string[] = [];
    for (let y = 0; y < buffer.length; y += 1) lines.push(buffer.getLine(y)?.translateToString(true) ?? '');
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
}

export const xtermViewEmulator: EmulatorFactory = (cols, rows) => new XtermView(cols, rows);

export function isTerminalView(emulator: ScreenEmulator): emulator is TerminalView {
  return typeof (emulator as Partial<TerminalView>).attach === 'function';
}
