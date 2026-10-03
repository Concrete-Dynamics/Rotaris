import { describe, expect, it } from 'vitest';
import { ELLIPSIS, collapseHome, elideMiddle, rowLabel, workspaceLabel } from './workspace-label.js';

/** A measure that charges one unit per code point — enough to test the rule, which is width-based. */
const byChar = (s: string) => Array.from(s).length;

describe('REQ-WORKSPACE-149 rule 1 — home collapsing', () => {
  it('renders home itself as ~ and a path beneath it relative to home', () => {
    expect(collapseHome('C:\\Users\\ganga', 'C:\\Users\\ganga')).toBe('~');
    expect(collapseHome('C:\\Users\\ganga\\dev\\atlas', 'C:\\Users\\ganga')).toBe('~\\dev\\atlas');
    expect(collapseHome('/home/ganga/dev/atlas', '/home/ganga')).toBe('~/dev/atlas');
  });

  it('leaves any other path absolute, including a sibling whose name starts with home', () => {
    expect(collapseHome('D:\\Development\\Apps', 'C:\\Users\\ganga')).toBe('D:\\Development\\Apps');
    expect(collapseHome('/home/ganga-old/dev', '/home/ganga')).toBe('/home/ganga-old/dev');
    expect(collapseHome('/homework/notes', '/home')).toBe('/homework/notes');
  });

  it('takes the separator and the case rule from home, which came from the platform', () => {
    expect(collapseHome('c:\\users\\ganga\\dev', 'C:\\Users\\ganga')).toBe('~\\dev');
    expect(collapseHome('/Home/Ganga/dev', '/home/ganga')).toBe('/Home/Ganga/dev');
  });

  it('collapses nothing when main sent no home', () => {
    expect(collapseHome('/home/ganga/dev', undefined)).toBe('/home/ganga/dev');
  });
});

describe('REQ-WORKSPACE-149 rule 2 — middle elision against the measured width', () => {
  it('leaves a label that fits exactly as it is', () => {
    expect(elideMiddle('~/dev/atlas', 11, byChar)).toBe('~/dev/atlas');
  });

  it('shortens from the middle with exactly one ellipsis, keeping both ends', () => {
    const out = elideMiddle('~/dev/atlas-billing/services/api', 16, byChar);
    expect(out).not.toBeNull();
    expect(byChar(out!)).toBeLessThanOrEqual(16);
    expect(Array.from(out!).filter((c) => c === ELLIPSIS)).toHaveLength(1);
    expect(out!.startsWith('~/')).toBe(true);
    expect(out!.endsWith('api')).toBe(true);
  });

  it('hides the label entirely rather than drawing it clipped when even the ellipsis will not fit', () => {
    expect(elideMiddle('~/dev/atlas', 0, byChar)).toBeNull();
    expect(elideMiddle('~/dev/atlas', Number.NaN, byChar)).toBeNull();
  });

  it('hides it rather than trusting a measurer that charges nothing for a label with characters', () => {
    // Found by driving the built app: `WorkspaceChip.measurerFor` answers `() => 0` wherever a canvas
    // 2D context or the computed font is unavailable, and with that measurer every candidate fits —
    // so a 348 px path was drawn into an 87 px chip, clipped, which is the one thing rule 2 forbids.
    expect(elideMiddle('~/dev/atlas-billing/services/api', 87, () => 0)).toBeNull();
    expect(elideMiddle('~/dev/atlas-billing/services/api', 87, byChar)).not.toBeNull();
  });

  it('recomputes from the width it is given, which is what lets a resize change the answer', () => {
    const path = '~/dev/atlas-billing/services/api';
    expect(elideMiddle(path, 40, byChar)).toBe(path);
    expect(byChar(elideMiddle(path, 12, byChar)!)).toBeLessThanOrEqual(12);
    expect(elideMiddle(path, 1, byChar)).toBe(ELLIPSIS);
  });
});

describe('REQ-WORKSPACE-149 — the two rules together, in the order the requirement states them', () => {
  it('collapses before shortening, so a deep path under home keeps its tail', () => {
    const out = workspaceLabel('/home/ganga/dev/atlas-billing/services/api', '/home/ganga', 16, byChar);
    expect(out!.startsWith('~/')).toBe(true);
    expect(out!.endsWith('api')).toBe(true);
  });

  it('renders a folder named with markup as the literal text it is (rule 3)', () => {
    // Rule 3 is React's doing, not this module's; what is asserted here is that neither rule
    // rewrites, escapes or drops such characters on the way to the surface that renders them.
    const nasty = '/home/ganga/<script>alert(1)</script>';
    expect(collapseHome(nasty, '/home/ganga')).toBe('~/<script>alert(1)</script>');
    expect(elideMiddle('~/<script>', 40, byChar)).toBe('~/<script>');
  });
});

describe('REQ-WORKSPACE-149 rule 2 in the status strip — a label in a flex row (the path link and the branch item)', () => {
  // The note's drive: a 96-character scratch path in a strip at 1180 px. Seven units a character, as a monospace face.
  const path = '/tmp/claude-0/-home-user-Rotaris-crw/349f6b0e-6880-59f4-942d-818d53f7b76a/scratchpad/proj-folder';
  const mono = (s: string) => Array.from(s).length * 7;

  it('asks the row for the whole label plus what the box spends beside it, independent of the width it was given', () => {
    expect(rowLabel(path, 10, 2_000, mono).basis).toBe(path.length * 7 + 10);
    expect(rowLabel(path, 10, 120, mono).basis).toBe(path.length * 7 + 10);
  });

  it('draws the whole label when the row gives it its basis', () => {
    expect(rowLabel(path, 10, path.length * 7 + 10, mono).label).toBe(path);
  });

  it('shortened by the row, keeps the head and the folder name with exactly one ellipsis between them, never its end cut', () => {
    const { label } = rowLabel(path, 10, 310, mono);
    expect(label).not.toBeNull();
    expect(mono(label!)).toBeLessThanOrEqual(300);
    expect(Array.from(label!).filter((c) => c === ELLIPSIS)).toHaveLength(1);
    expect(label!.startsWith('/tmp/')).toBe(true);
    expect(label!.endsWith('/proj-folder')).toBe(true);
  });

  it('hides the label, rather than clipping it, where the box cannot hold even the ellipsis', () => {
    expect(rowLabel(path, 10, 16, mono).label).toBeNull();
    expect(rowLabel('main', 0, 6, mono).label).toBeNull();
    expect(rowLabel('main', 0, 7, mono).label).toBe(ELLIPSIS);
  });

  it('asks for nothing, and hides the label, where the measurer charges nothing (no canvas)', () => {
    expect(rowLabel(path, 10, 2_000, () => 0)).toEqual({ basis: null, label: null });
  });
});

