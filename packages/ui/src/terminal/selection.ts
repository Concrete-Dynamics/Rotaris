/**
 * Part AM — REQ-SHELL-101's selection: whole cells, the same selection whether dragged forwards or backwards, each
 * row right-trimmed, rows joined with newlines, and a copy with nothing selected puts nothing on the clipboard and
 * reports failure. The library paints the selection; the extraction is ours (ADR-0047 B's "against" list).
 */
export interface CellPosition {
  /** 0-based column. */
  readonly x: number;
  /** 0-based buffer row (scrollback included). */
  readonly y: number;
}

/** `start` is never after `end`; `end.x` is exclusive, as xterm's own selection end is. */
export interface CellRange { readonly start: CellPosition; readonly end: CellPosition }

export function normaliseRange(a: CellPosition, b: CellPosition): CellRange {
  const forwards = a.y < b.y || (a.y === b.y && a.x <= b.x);
  return forwards ? { start: a, end: b } : { start: b, end: a };
}

/** Reads the cells of one buffer row between two columns as text, wide cells intact (`ScreenEmulator.readCells`). */
export type CellReader = (row: number, fromColumn: number, toColumn: number) => string;

export function extractSelection(read: CellReader, range: CellRange, cols: number): string {
  const rows: string[] = [];
  for (let y = range.start.y; y <= range.end.y; y += 1) {
    const from = y === range.start.y ? range.start.x : 0;
    const to = y === range.end.y ? range.end.x : cols;
    rows.push(from >= to ? '' : read(y, from, to).replace(/\s+$/u, ''));
  }
  return rows.join('\n');
}

export const NOTHING_SELECTED = 'Nothing is selected.';
export const NOTHING_TO_COPY = 'There is no terminal output to copy.';

export type CopyOutcome = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: string };

/** An empty selection is a failure, never an empty success. */
export function copyText(text: string, emptyReason = NOTHING_SELECTED): CopyOutcome {
  return text === '' ? { ok: false, reason: emptyReason } : { ok: true, text };
}
