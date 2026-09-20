import { describe, expect, it } from 'vitest';
import { PANEL_GAP, PANEL_MARGIN, PANEL_MIN_HEIGHT, panelPlacement } from './panel-placement.js';

describe('panelPlacement — the picker panels stay inside the viewport', () => {
  it('opens downward for a trigger near the top (the run header switch)', () => {
    const box = panelPlacement({ left: 300, bottom: 120, width: 150 }, { width: 1280, height: 800 });
    expect(box.top).toBe(120 + PANEL_GAP);
    expect(box.bottom).toBeUndefined();
    expect(box.maxHeight).toBe(800 - 120 - PANEL_MARGIN - PANEL_GAP);
    expect(box.minWidth).toBe(150);
  });

  it('opens upward for a trigger near the bottom (the composer chips), keeping the legacy anchor', () => {
    const box = panelPlacement({ left: 300, bottom: 760, width: 150 }, { width: 1280, height: 800 });
    expect(box.bottom).toBe(800 - 760);
    expect(box.top).toBeUndefined();
    expect(box.maxHeight).toBe(760 - PANEL_MARGIN - PANEL_GAP);
  });

  it('clamps the left edge so a wide trigger never leaves the viewport', () => {
    const box = panelPlacement({ left: 1200, bottom: 120, width: 150 }, { width: 1280, height: 800 });
    expect(box.left).toBe(1280 - 150 - PANEL_MARGIN);
  });

  it('never reports an unusable maxHeight', () => {
    const box = panelPlacement({ left: 8, bottom: 4, width: 100 }, { width: 200, height: 200 });
    expect(box.maxHeight).toBeGreaterThanOrEqual(PANEL_MIN_HEIGHT);
    expect(box.left).toBe(PANEL_MARGIN);
  });
});
