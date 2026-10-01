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

/** The monospace face the grid's cell is drawn in (the shape `colours.ts`'s `TerminalFont` resolves). */
export interface GridFace { readonly family: string; readonly sizePx: number }

export interface RemeasurePorts {
  /** The face the theme names now, read from the document root. */
  readonly face: () => GridFace;
  /** Hand the library the theme with this face; it re-measures its own cell synchronously on the option change. */
  readonly apply: (face: GridFace) => void;
  /** Measure the host against the library's cell and offer the proposal to the `GeometryReporter`. */
  readonly measure: () => void;
  /** Run once in the next frame, after the library has repainted; returns the cancel. */
  readonly nextFrame: (run: () => void) => () => void;
}

/**
 * REQ-SHELL-100's re-measure on a theme change: the grid is measured only against the cell of the face the theme names
 * now, so a shape no settled layout had is never reported.
 *
 * A face change re-lays the tab's header in the same frame, so the host shrinks before the library has the new face.
 * Defect fifty-five (ADR-0047) kept the resize observer quiet while a re-measure was pending, but the flag was raised by
 * the layout effect React runs for the theme change, and React renders that change in a task of its own. When a frame
 * falls between the root's style change and that task (always, for a change made in the frame's own callbacks; often,
 * under load) the observer ran first, measured the shrunk host against the OLD cell and reported it: `118×25` between
 * `118×26` and `89×19` (`docs/defects/fixed/a-font-change-under-load-reports-an-intermediate-terminal-geometry.md`).
 * Every observation now compares the face the theme names with the face the library was given. A difference applies the
 * new face there and then and measures once, in the frame after, whichever path saw the change first.
 */
export class RemeasureGate {
  private applied: GridFace | null = null;
  private cancel: (() => void) | null = null;
  constructor(private readonly ports: RemeasurePorts) {}

  /** A theme change, and the mount: give the library the theme and measure once, in the next frame. */
  retheme(): void {
    this.cancel?.();
    const face = this.ports.face();
    this.ports.apply(face);
    this.applied = face;
    this.cancel = this.ports.nextFrame(() => { this.cancel = null; this.observe(); });
  }

  /**
   * A resize or a visibility change. Quiet while a re-measure is pending, since that frame measures with the new cell; a
   * face the library has not been given is applied first and measured in the next frame; otherwise it measures now.
   */
  observe(): void {
    if (this.cancel !== null) return;
    const face = this.ports.face();
    if (this.applied === null || face.family !== this.applied.family || face.sizePx !== this.applied.sizePx) { this.retheme(); return; }
    this.ports.measure();
  }

  /** Whether a re-measure is waiting for its frame. */
  get pending(): boolean { return this.cancel !== null; }

  dispose(): void {
    this.cancel?.();
    this.cancel = null;
  }
}
