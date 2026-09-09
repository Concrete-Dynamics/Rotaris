/**
 * Part AM — REQ-SHELL-100's geometry: cell size from the theme's monospace face, a fixed 6 px gutter, never fewer than
 * 20×4, 80×24 preferred, and dimensions reported to the backend only while the grid is visible and meaningfully laid
 * out, and only when they change. ADR-0047 names the hazard: a zero-height or placeholder-size measurement reported
 * once shrinks a running full-screen program's screen and discards its output. The guard is explicit here.
 */
export const TERM_GUTTER_PX = 6;
export const MIN_COLS = 20;
export const MIN_ROWS = 4;
export const PREFERRED_COLS = 80;
export const PREFERRED_ROWS = 24;

export interface GridGeometry { readonly cols: number; readonly rows: number }

export interface LayoutMeasure {
  readonly hostWidth: number;
  readonly hostHeight: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  /** Connected to the document and painted — `display: none`, a detached host and a hidden window all read false. */
  readonly visible: boolean;
}

/**
 * The size the grid would take. `null` means "not meaningfully laid out": no cell has been measured, the host has no
 * size, it is not visible, or it cannot hold even the 20×4 minimum — which is what a placeholder-size viewport looks
 * like, and which is therefore never reported. A visible host that holds the minimum reports at least the minimum.
 */
export function proposeGeometry(measure: LayoutMeasure): GridGeometry | null {
  const { hostWidth, hostHeight, cellWidth, cellHeight, visible } = measure;
  if (!visible || !(cellWidth > 0) || !(cellHeight > 0) || !(hostWidth > 0) || !(hostHeight > 0)) return null;
  const cols = Math.floor((hostWidth - 2 * TERM_GUTTER_PX) / cellWidth);
  const rows = Math.floor((hostHeight - 2 * TERM_GUTTER_PX) / cellHeight);
  if (cols < MIN_COLS || rows < MIN_ROWS) return null;
  return { cols, rows };
}

/** Reports a geometry only when it differs from the last one reported; `null` proposals are never reported. */
export class GeometryReporter {
  private last: GridGeometry | null = null;
  constructor(private readonly report: (geometry: GridGeometry) => void) {}

  offer(geometry: GridGeometry | null): boolean {
    if (geometry === null) return false;
    if (this.last !== null && this.last.cols === geometry.cols && this.last.rows === geometry.rows) return false;
    this.last = geometry;
    this.report(geometry);
    return true;
  }

  get reported(): GridGeometry | null { return this.last; }
}
