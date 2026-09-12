import { describe, expect, it } from 'vitest';
import { ELLIPSIS, collapseHome, elideMiddle, workspaceLabel } from './workspace-label.js';

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
