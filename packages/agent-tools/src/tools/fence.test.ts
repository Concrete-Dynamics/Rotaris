/**
 * The fence's path rule: case, Unicode normalisation and the backslash folded only where the platform's default file
 * system folds them (REQ-TOOLS-129, REQ-TOOLS-130, REQ-TOOLS-132; R-091, `hardening.md` §3.4 row 5, bundle D3).
 *
 * Every platform's rule is injected (`pathRuleFor`), so the Linux, macOS and Windows readings are all exercised on any
 * host. The lexical cases hand `isInside` paths already resolved by that platform's own `path` module; the real-root
 * cases at the end run `checkFence` against this host's file system.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, win32 } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkFence, isInside, pathKey, pathRuleFor, PLATFORM_PATH_RULE, type FenceConfig } from './fence.js';

const LINUX = pathRuleFor('linux');
const DARWIN = pathRuleFor('darwin');
const WIN32 = pathRuleFor('win32');

const NFC = 'caf\u00e9';
const NFD = 'cafe\u0301';

describe('the fence folds only where the file system folds (REQ-TOOLS-129)', () => {
  it('the platform rule is the default file system\'s: Windows and macOS fold case, Linux does not', () => {
    expect(LINUX).toEqual({ foldsCase: false, foldsUnicode: false, backslashSeparates: false });
    expect(DARWIN).toEqual({ foldsCase: true, foldsUnicode: true, backslashSeparates: false });
    expect(WIN32).toEqual({ foldsCase: true, foldsUnicode: false, backslashSeparates: true });
    expect(pathRuleFor('freebsd')).toEqual(LINUX);
    expect(PLATFORM_PATH_RULE).toEqual(pathRuleFor(process.platform));
  });

  it('on Linux a sibling that differs from the root by case alone is outside, and a segment differing by case is another file', () => {
    expect(isInside('/work', '/Work/x', LINUX)).toBe(false);
    expect(isInside('/work/secret', '/work/Secret', LINUX)).toBe(false);
    expect(isInside('/work/secret', '/work/Secret/key', LINUX)).toBe(false);
    expect(isInside('/work', '/work/Secret/key', LINUX)).toBe(true);
    expect(isInside('/work', '/work', LINUX)).toBe(true);
    expect(pathKey('/work/Secret', LINUX)).not.toBe(pathKey('/work/secret', LINUX));
  });

  it('on macOS and Windows the same spellings are one path', () => {
    expect(isInside('/work', '/Work/x', DARWIN)).toBe(true);
    expect(isInside('/work/secret', '/work/Secret/key', DARWIN)).toBe(true);
    expect(isInside('C:\\work', 'c:\\WORK\\x', WIN32)).toBe(true);
    expect(isInside('C:\\work\\secret', 'C:\\work\\Secret\\key', WIN32)).toBe(true);
  });

  it('the NFC and NFD spellings of one name are one path on macOS and two on Linux and Windows', () => {
    expect(NFC).not.toBe(NFD);
    expect(isInside(`/work/${NFC}`, `/work/${NFD}/x`, DARWIN)).toBe(true);
    expect(isInside(`/work/${NFD}`, `/work/${NFC}`, DARWIN)).toBe(true);
    expect(isInside(`/work/${NFC}`, `/work/${NFD}/x`, LINUX)).toBe(false);
    expect(isInside(`C:\\work\\${NFC}`, `C:\\work\\${NFD}\\x`, WIN32)).toBe(false);
  });

  it('a backslash separates on Windows alone: on POSIX `/work\\x` is a name beside the root, never under it', () => {
    expect(isInside('/work', '/work\\x', LINUX)).toBe(false);
    expect(isInside('/work', '/work\\x', DARWIN)).toBe(false);
    expect(isInside('C:\\work', 'C:/work/x', WIN32)).toBe(true);
    expect(isInside('C:\\work\\', 'C:\\work\\x', WIN32)).toBe(true);
  });

  it('a name that only begins with the root\'s name is a sibling under every rule', () => {
    expect(isInside('/work', '/work2/x', LINUX)).toBe(false);
    expect(isInside('/work', '/WORK2/x', DARWIN)).toBe(false);
    expect(isInside('C:\\work', 'C:\\Work2\\x', WIN32)).toBe(false);
  });

  it('`..` is resolved before the comparison: a climb that comes back is inside, one that stays out is not, under each rule', () => {
    expect(isInside('/a/work', posix.resolve('/a/work', 'src/../lib/x'), LINUX)).toBe(true);
    expect(isInside('/a/work', posix.resolve('/a/work', '../work2/x'), LINUX)).toBe(false);
    // Out and back through a case variant of the root's own name: another directory on Linux, the root on macOS.
    expect(isInside('/a/work', posix.resolve('/a/work', '../Work/x'), LINUX)).toBe(false);
    expect(isInside('/a/work', posix.resolve('/a/work', '../Work/x'), DARWIN)).toBe(true);
    expect(isInside('C:\\a\\work', win32.resolve('C:\\a\\work', '..\\WORK\\x'), WIN32)).toBe(true);
    expect(isInside('C:\\a\\work', win32.resolve('C:\\a\\work', '..\\..\\x'), WIN32)).toBe(false);
  });
});

describe('checkFence over a real root under an injected case rule (REQ-TOOLS-129, REQ-TOOLS-132)', () => {
  let base: string;
  let root: string;
  let outside: string;
  let cfg: FenceConfig;
  beforeEach(() => {
    base = realpathSync.native(mkdtempSync(join(tmpdir(), 'rotaris-fence-rule-')));
    root = join(base, 'ws');
    outside = join(base, 'elsewhere');
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(outside);
    writeFileSync(join(outside, 'secret.txt'), 'x');
    cfg = { workspaceRoot: root, allowOutsideWorkspace: false, additionalReadOnlyRoots: [] };
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  // This host's own separator, with case and normalisation folded and not: the two case rules a real path meets here.
  const FOLDING = { ...PLATFORM_PATH_RULE, foldsCase: true, foldsUnicode: true };
  const EXACT = { ...PLATFORM_PATH_RULE, foldsCase: false, foldsUnicode: false };

  it('a link inside the root that leads outside resolves outside and is refused, folding or not', () => {
    // A junction on Windows needs no privilege; a directory symlink elsewhere (the existing tests' shape).
    symlinkSync(outside, join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    for (const rule of [FOLDING, EXACT]) {
      const v = checkFence(cfg, 'link/secret.txt', 'write', rule);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.message).toBe(`Path '${join(outside, 'secret.txt')}' is outside workspace root '${root}'`);
      expect(checkFence(cfg, 'src/new.txt', 'write', rule)).toMatchObject({ ok: true, inside: true, rel: 'src/new.txt' });
    }
  });

  it('a read-only root is compared under the same rule', () => {
    const ro: FenceConfig = { ...cfg, additionalReadOnlyRoots: [outside] };
    expect(checkFence(ro, join(outside, 'secret.txt'), 'read', EXACT)).toMatchObject({ ok: true, readOnlyRoot: true });
    expect(checkFence(ro, join(outside, 'secret.txt'), 'write', EXACT).ok).toBe(false);
  });
});
