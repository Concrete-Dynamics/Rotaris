import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { PREPARATION_MARKER, PREPARATION_NOTICE_KEY, preparationFindingOf, preparationNotice, readPreparationFinding } from './preparation-notice.js';

/**
 * REQ-STARTUP-165 (c): the one preparation outcome the product reports, read from the marker the launcher stub writes
 * beside the image it starts (ADR-0054, "How the application learns of it"). The marker texts below are the stub's own
 * shape (`marker_text` in `apps/desktop/launcher/src/main.rs`).
 */
const marker = (outcome: string, unprepared?: string, header = 'rotaris-preparation 1'): string =>
  `${header}\ntoken 1.0.0-0123456789abcdef\noutcome ${outcome}\n${unprepared === undefined ? '' : `unprepared-root ${unprepared}\n`}entry rotaris\nfile 1024 rotaris\nfile 17 resources/app/index.js\n`;

describe('the finding a marker holds (REQ-STARTUP-165 (c), REQ-STARTUP-150)', () => {
  it('a run-scoped run names the per-user data directory above the preparation root, never the placement within it', () => {
    expect(preparationFindingOf(marker('run-scoped', '/home/u/.local/share/rotaris/prepared'))).toEqual({ storage: { kind: 'directory', path: '/home/u/.local/share/rotaris' } });
    expect(preparationFindingOf(marker('run-scoped', 'C:\\Users\\u\\AppData\\Local\\rotaris\\data\\prepared'))).toEqual({ storage: { kind: 'directory', path: 'C:\\Users\\u\\AppData\\Local\\rotaris\\data' } });
  });

  it('a root of another shape is named as given: it is still the storage the stub failed on', () => {
    expect(preparationFindingOf(marker('run-scoped', '/srv/elsewhere/'))).toEqual({ storage: { kind: 'directory', path: '/srv/elsewhere' } });
  });

  it('a stub that resolved no per-user data directory says so, and a run-scoped marker naming no root is still warned about', () => {
    expect(preparationFindingOf(marker('run-scoped', '(no per-user data directory)'))).toEqual({ storage: { kind: 'none' } });
    expect(preparationFindingOf(marker('run-scoped'))).toEqual({ storage: { kind: 'unstated' } });
    expect(preparationFindingOf(marker('run-scoped', 'relative/path'))).toEqual({ storage: { kind: 'unstated' } });
  });

  it('reads a marker written with CRLF line ends', () => {
    expect(preparationFindingOf(marker('run-scoped', '/d/rotaris/prepared').replace(/\n/g, '\r\n'))).toEqual({ storage: { kind: 'directory', path: '/d/rotaris' } });
  });

  it('the four silent outcomes — preparing, reusing, superseding, redoing — all write `prepared`, and answer nothing', () => {
    expect(preparationFindingOf(marker('prepared'))).toBeUndefined();
  });

  it('no marker, an unknown outcome, another header or launcher format, and text that is no marker at all answer nothing', () => {
    expect(preparationFindingOf(undefined)).toBeUndefined();
    expect(preparationFindingOf('')).toBeUndefined();
    expect(preparationFindingOf(marker('something-else', '/d/prepared'))).toBeUndefined();
    expect(preparationFindingOf(marker('run-scoped', '/d/prepared', 'rotaris-preparation 99'))).toBeUndefined();
    expect(preparationFindingOf(marker('run-scoped', '/d/prepared', 'rotaris-preparation'))).toBeUndefined();
    expect(preparationFindingOf(marker('run-scoped', '/d/prepared', 'other-marker 1'))).toBeUndefined();
    expect(preparationFindingOf(String.fromCharCode(0xff, 0xfe, 0, 1, 2))).toBeUndefined();
  });
});

describe('the read, relative to the application\'s own image (ADR-0054, ADR-0055 phase −1)', () => {
  const image = join('/placed', 'tree', 'rotaris');

  it('reads the marker beside the executable the launch runs', () => {
    const asked: string[] = [];
    const finding = readPreparationFinding(image, (path) => { asked.push(path); return marker('run-scoped', '/d/rotaris/prepared'); });
    expect(asked).toEqual([join('/placed', 'tree', PREPARATION_MARKER)]);
    expect(finding).toEqual({ storage: { kind: 'directory', path: '/d/rotaris' } });
  });

  it('a read that fails — no marker there, every ordinary launch — answers nothing and throws nothing', () => {
    expect(readPreparationFinding(image, () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); })).toBeUndefined();
  });
});

describe('the notice (REQ-STARTUP-165 (c))', () => {
  it('raises a warning, once per run, saying it could not prepare itself, where, and that every launch costs the same until it can', () => {
    expect(preparationNotice({ storage: { kind: 'directory', path: '/home/u/.local/share/rotaris' } })).toEqual({
      severity: 'warning',
      key: PREPARATION_NOTICE_KEY,
      title: 'Rotaris could not prepare itself, so it is starting the slow way',
      message: 'It could not prepare itself in its per-user data directory, /home/u/.local/share/rotaris. Every launch will take as long as this one until that directory accepts a preparation; Rotaris otherwise works as usual.',
    });
  });

  it('where the stub found no per-user data directory it says so', () => {
    expect(preparationNotice({ storage: { kind: 'none' } }).message).toBe(
      'It found no per-user data directory on this machine to prepare itself in. Every launch will take as long as this one until a per-user data directory accepts a preparation; Rotaris otherwise works as usual.',
    );
  });

  it('where the marker named no root the storage is still named as the per-user data directory, without a path', () => {
    expect(preparationNotice({ storage: { kind: 'unstated' } }).message).toBe(
      'It could not prepare itself in its per-user data directory. Every launch will take as long as this one until that directory accepts a preparation; Rotaris otherwise works as usual.',
    );
  });

  it('never names the preparation root or a placement, never reads as the workspace-storage warning, never says it cannot be used', () => {
    for (const storage of [{ kind: 'directory', path: '/d/rotaris' }, { kind: 'none' }, { kind: 'unstated' }] as const) {
      const n = preparationNotice({ storage });
      const words = `${n.title} ${n.message ?? ''} ${n.detail ?? ''}`;
      expect(words).not.toMatch(/prepared\b|\.run-|rotaris-run-|placement/);
      expect(words).not.toMatch(/workspace|shared|synchron|project/i);
      expect(words).not.toMatch(/cannot be used|unusable|not usable|cannot run|will not start/i);
      expect(words).not.toMatch(/extract|unpack|cache/i);
      expect(n.action).toBeUndefined();
      expect(n.persistent).toBeUndefined();
    }
  });
});
