/**
 * Shared anchoring for the press-revealed picker panels (`SearchableSelect` in
 * `searchable-select.tsx`, `PopoverMenu` in `overlays.tsx`).
 *
 * Falsified cause: both pickers anchored their panel with
 * `bottom: viewportHeight - trigger.bottom` unconditionally, so the panel always
 * grew upward from the trigger's bottom edge. A trigger near the top of the
 * window (the run header's "Switch model…") pushed the panel past the viewport
 * top, where it clipped instead of flipping. The upward anchor is kept for
 * triggers with more room above (the composer's chips at the window bottom);
 * a trigger with at least as much room below now opens downward.
 */
export interface TriggerRect {
  readonly left: number;
  readonly bottom: number;
  readonly width: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface PanelBox {
  readonly left: number;
  /** Set when the panel opens downward; mutually exclusive with `bottom`. */
  readonly top?: number | undefined;
  /** Set when the panel opens upward; mutually exclusive with `top`. */
  readonly bottom?: number | undefined;
  readonly minWidth: number;
  /** The free space on the chosen side, so the panel scrolls instead of clipping. */
  readonly maxHeight: number;
}

/** Gap between trigger and panel; the matching CSS margin carries it visually. */
export const PANEL_GAP = 4;
/** Minimum distance kept to the viewport edges. */
export const PANEL_MARGIN = 8;
/** A panel shorter than this is unusable — never report less, so it scrolls instead. */
export const PANEL_MIN_HEIGHT = 96;

export function panelPlacement(trigger: TriggerRect, viewport: ViewportSize): PanelBox {
  const left = Math.max(
    PANEL_MARGIN,
    Math.min(trigger.left, Math.max(PANEL_MARGIN, viewport.width - trigger.width - PANEL_MARGIN)),
  );
  const minWidth = trigger.width;
  // The upward anchor is the legacy one: the panel's bottom edge sits at the
  // trigger's bottom edge (the CSS `margin-bottom` supplies the visual gap), so the
  // room above is measured to the trigger's bottom, not its top.
  const spaceAbove = trigger.bottom - PANEL_MARGIN;
  const spaceBelow = viewport.height - trigger.bottom - PANEL_MARGIN;
  if (spaceBelow >= spaceAbove) {
    return {
      left,
      top: trigger.bottom + PANEL_GAP,
      minWidth,
      maxHeight: Math.max(PANEL_MIN_HEIGHT, spaceBelow - PANEL_GAP),
    };
  }
  return {
    left,
    bottom: viewport.height - trigger.bottom,
    minWidth,
    maxHeight: Math.max(PANEL_MIN_HEIGHT, spaceAbove - PANEL_GAP),
  };
}
