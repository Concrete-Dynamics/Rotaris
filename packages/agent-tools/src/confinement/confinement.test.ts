import { describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import {
  BWRAP_BY_HAND, ConfinementService, SandboxUnavailableError, SEATBELT_TRIAL,
  bwrapOptions, computeConfinement, confinementStatus, mechanismFor, outputIsLauncherOnly,
  probeOnce, profileQuote, renderBwrap, renderSeatbelt, renderUnavailability, seatbeltProfile,
  shellQuote, trialLine, wrapForConfinement, type AvailabilityVerdict, type ProbeDeps, type SpecDeps,
} from './index.js';

const present = (...paths: string[]): SpecDeps => ({ exists: (p) => paths.includes(p) });
const nothing: SpecDeps = { exists: () => false };
const available = (backend: 'seatbelt' | 'bubblewrap'): AvailabilityVerdict => ({ available: true, backend, reason: '', remediation: '' });

describe('quoting is a security boundary (REQ-SANDBOX-064)', () => {
  // The property the requirement states: no crafted path can end its enclosing literal and
  // introduce rules of its own. `sh -c` reading the quoted token back must yield the input.
  const hostile = [
    "/ws/it's", '/ws/a"b', '/ws/back\\slash', '/ws/two  spaces', '/ws/new\nline',
    "/ws/'; rm -rf /; echo '", '/ws/$(whoami)', '/ws/`id`', '/ws/héllo-ünicode', '', "'", "''", "\\'",
  ];

  it('shellQuote yields one POSIX single-quoted token whose content is exactly the input', () => {
    for (const value of hostile) {
      const quoted = shellQuote(value);
      expect(quoted.startsWith("'")).toBe(true);
      expect(quoted.endsWith("'")).toBe(true);
      // Decode the POSIX form the way a shell does: `'\''` is a literal quote, everything else
      // between the outer quotes is literal.
      const decoded = quoted.slice(1, -1).replaceAll(`'\\''`, "'");
      expect(decoded).toBe(value);
      // No unescaped quote survives to terminate the literal early.
      expect(quoted.slice(1, -1).replaceAll(`'\\''`, '')).not.toContain("'");
    }
  });

  it('profileQuote escapes backslash and double quote, and nothing else', () => {
    expect(profileQuote('/ws/a"b')).toBe('"/ws/a\\"b"');
    expect(profileQuote('/ws/back\\slash')).toBe('"/ws/back\\\\slash"');
    for (const value of hostile) {
      const quoted = profileQuote(value);
      const decoded = quoted.slice(1, -1).replaceAll('\\"', '"').replaceAll('\\\\', '\\');
      expect(decoded).toBe(value);
    }
  });

  it('a crafted workspace path cannot introduce profile rules of its own', () => {
    const spec = computeConfinement({ mode: 'workspace-write', executionRoot: '/ws") (allow default) (subpath "/', writableRoots: [], allowNetwork: false }, nothing);
    const profile = seatbeltProfile(spec);
    // The injected text survives only INSIDE a string literal. Read the profile the way a lexer
    // does — consume `\\` and `\"` as escapes, blank out every completed string — and the crafted
    // form must be gone from what remains, which is the part Seatbelt would act on.
    const outsideStrings = profile.replace(/"(?:\\.|[^"\\])*"/g, '""');
    expect(outsideStrings).not.toContain('(allow default)');
    // Every quote in the rendered text is either a delimiter or escaped: the literals are balanced,
    // so no crafted path ended its enclosing literal.
    expect(outsideStrings.split('"').length - 1).toBe((profile.match(/"(?:\\.|[^"\\])*"/g) ?? []).length * 2);
    // The crafted root produced ONE allowance and its two denials, not extra forms: two forms for
    // the version and the default deny, five blanket allowances, the temp and device lines, one
    // root allowance and two denials.
    expect(profile.split('\n')).toHaveLength(12);
    expect(profile.split('\n').every((line) => line !== '(allow default)')).toBe(true);
  });
});

describe('the shared specification (REQ-SANDBOX-056..061, 091)', () => {
  it('read-only grants no writable root, so every protected name is case (a) (REQ-SANDBOX-058, -077a)', () => {
    const spec = computeConfinement({ mode: 'read-only', executionRoot: '/ws', writableRoots: ['/extra'], allowNetwork: false }, present('/extra', '/ws/.git'));
    expect(spec.writableRoots).toEqual([]);
    expect(spec.carveOuts.map((c) => c.kase)).toEqual(['outside', 'outside']);
    expect(bwrapOptions(spec)).not.toContain('--ro-bind-try');
  });

  it('workspace-write puts the execution root first, then configured roots, duplicates removed keeping the first', () => {
    const spec = computeConfinement({ mode: 'workspace-write', executionRoot: '/ws', writableRoots: ['/b', '/a', '/b', '/ws'], allowNetwork: false }, present('/a', '/b'));
    expect(spec.writableRoots).toEqual(['/ws', '/b', '/a']);
  });

  it('a configured root missing at render time is skipped and named, never fatal (REQ-SANDBOX-058)', () => {
    const spec = computeConfinement({ mode: 'workspace-write', executionRoot: '/ws', writableRoots: ['/gone', '/here'], allowNetwork: false }, present('/here'));
    expect(spec.writableRoots).toEqual(['/ws', '/here']);
    expect(spec.skippedRoots).toEqual(['/gone']);
  });

  it('the execution root is the worktree while worktree isolation is in use (REQ-SANDBOX-091)', () => {
    const spec = computeConfinement({ mode: 'workspace-write', executionRoot: '/ws/.rotaris/worktrees/s1', writableRoots: [], allowNetwork: false }, nothing);
    expect(spec.writableRoots).toEqual(['/ws/.rotaris/worktrees/s1']);
  });

  it('both protected names are carved out of every writable root, by existence (REQ-SANDBOX-056, -077)', () => {
    const spec = computeConfinement({ mode: 'workspace-write', executionRoot: '/ws', writableRoots: ['/extra'], allowNetwork: false }, present('/extra', '/ws/.git'));
    expect(spec.carveOuts).toEqual([
      { path: '/ws/.git', kase: 'exists' },
      { path: '/ws/.rotaris', kase: 'absent' },
      { path: '/extra/.git', kase: 'absent' },
      { path: '/extra/.rotaris', kase: 'absent' },
    ]);
  });

  it('a dangling link counts as absent and takes case (c) (REQ-SANDBOX-078)', () => {
    // `exists` follows links, so a link with no target reads false — the restrictive side.
    const spec = computeConfinement({ mode: 'workspace-write', executionRoot: '/ws', writableRoots: [], allowNetwork: false }, nothing);
    expect(spec.carveOuts.every((c) => c.kase === 'absent')).toBe(true);
  });
});

describe('the Linux renderer (REQ-SANDBOX-076, -077, -079)', () => {
  const spec = computeConfinement({ mode: 'workspace-write', executionRoot: '/ws', writableRoots: [], allowNetwork: false }, present('/ws/.git'));

  it('renders the fixed sequence: read-only root, dev, proc, tmpfs, binds, carve-outs, network, die-with-parent', () => {
    expect(bwrapOptions(spec)).toEqual([
      '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp',
      '--bind', '/ws', '/ws',
      '--ro-bind-try', '/ws/.git', '/ws/.git',
      '--tmpfs', '/ws/.rotaris', '--remount-ro', '/ws/.rotaris',
      '--unshare-net', '--die-with-parent',
    ]);
  });

  it('case (b) tolerates a source removed between the check and the launch (REQ-SANDBOX-077b, -078)', () => {
    expect(bwrapOptions(spec)).toContain('--ro-bind-try');
    expect(bwrapOptions(spec)).not.toContain('--ro-bind-try-not');
  });

  it('carve-outs follow the writable binds, because ordering decides the outcome', () => {
    const options = bwrapOptions(spec);
    expect(options.indexOf('--bind')).toBeLessThan(options.indexOf('--ro-bind-try'));
  });

  it('the network namespace is kept separate unless the opt-in grants it (REQ-SANDBOX-059)', () => {
    const open = computeConfinement({ mode: 'workspace-write', executionRoot: '/ws', writableRoots: [], allowNetwork: true }, nothing);
    expect(bwrapOptions(open)).not.toContain('--unshare-net');
  });

  it('the command travels in as a single shell argument and is never split apart (REQ-SANDBOX-063, -079)', () => {
    const line = renderBwrap(spec, 'FOO="a b" ; echo "$FOO" | wc -l');
    expect(line.endsWith(`-- /bin/sh -c 'FOO="a b" ; echo "$FOO" | wc -l'`)).toBe(true);
  });
});

describe('the macOS renderer (REQ-SANDBOX-075, -079)', () => {
  const spec = computeConfinement({ mode: 'workspace-write', executionRoot: '/ws', writableRoots: [], allowNetwork: false }, present('/ws/.git'));

  it('denies by default, allows reads everywhere, and places denials after every allowance', () => {
    const profile = seatbeltProfile(spec);
    expect(profile.startsWith('(version 1)\n(deny default)')).toBe(true);
    expect(profile).toContain('(allow file-read*)');
    const lastAllow = profile.lastIndexOf('(allow ');
    const firstDeny = profile.indexOf('(deny file-write*');
    expect(firstDeny).toBeGreaterThan(lastAllow);
  });

  it('permits writes at the temporary locations and data at the device nodes in every active mode', () => {
    const readOnly = computeConfinement({ mode: 'read-only', executionRoot: '/ws', writableRoots: [], allowNetwork: false }, nothing);
    const profile = seatbeltProfile(readOnly);
    for (const p of ['/tmp', '/private/tmp', '/var/tmp', '/private/var/tmp', '/private/var/folders']) expect(profile).toContain(`(subpath "${p}")`);
    for (const d of ['/dev/null', '/dev/zero', '/dev/random', '/dev/urandom', '/dev/tty', '/dev/stdin', '/dev/stdout', '/dev/stderr', '/dev/dtracehelper']) expect(profile).toContain(`(literal "${d}")`);
    expect(profile).not.toContain('(allow file-write* (subpath "/ws"))');
  });

  it('grants one allowance per writable root and denies the protected subpaths after them', () => {
    const profile = seatbeltProfile(spec);
    expect(profile).toContain('(allow file-write* (subpath "/ws"))');
    expect(profile).toContain('(deny file-write* (subpath "/ws/.git"))');
    expect(profile).toContain('(deny file-write* (subpath "/ws/.rotaris"))');
  });

  it('permits or refuses the network as a whole, with no distinction by destination (REQ-SANDBOX-047)', () => {
    expect(seatbeltProfile(spec)).not.toContain('(allow network*)');
    const open = computeConfinement({ mode: 'read-only', executionRoot: '/ws', writableRoots: [], allowNetwork: true }, nothing);
    expect(seatbeltProfile(open)).toContain('(allow network*)');
  });

  it('renders sandbox-exec -p <profile> /bin/sh -c <command> (REQ-SANDBOX-079)', () => {
    const line = renderSeatbelt(spec, 'echo hi');
    expect(line.startsWith('sandbox-exec -p ')).toBe(true);
    expect(line.endsWith(`/bin/sh -c 'echo hi'`)).toBe(true);
  });
});

describe('backend parity (REQ-SANDBOX-061)', () => {
  it('the same configuration yields the same specification whatever renders it', () => {
    const input = { mode: 'workspace-write' as const, executionRoot: '/ws', writableRoots: ['/extra'], allowNetwork: false };
    const deps = present('/extra');
    const a = computeConfinement(input, deps);
    const b = computeConfinement(input, deps);
    expect(a).toEqual(b);
    // A fresh worktree holding neither name still denies both, on both backends.
    expect(bwrapOptions(a).filter((o) => o === '--remount-ro')).toHaveLength(4);
    expect(seatbeltProfile(a).match(/\(deny file-write\*/g)).toHaveLength(4);
  });
});

describe('the platform map is closed at two members (REQ-SANDBOX-065)', () => {
  it('maps darwin and linux, and nothing else, by exact equality after trim and lower-case', () => {
    expect(mechanismFor('darwin')).toEqual({ backend: 'seatbelt', launcher: 'sandbox-exec' });
    expect(mechanismFor('  LINUX  ')).toEqual({ backend: 'bubblewrap', launcher: 'bwrap' });
    for (const p of ['win32', 'freebsd', 'darwin64', 'linux2', 'wsl', 'macos', 'sunos', 'aix']) {
      expect(mechanismFor(p).backend).toBe('unavailable');
    }
  });
});

describe('the availability probe (REQ-SANDBOX-066..074)', () => {
  const base = (platform: string, over: Partial<ProbeDeps> = {}): ProbeDeps => ({
    platform,
    env: { PATH: '/usr/bin' },
    clocks: new FakeClock(),
    runTrial: async () => ({ kind: 'exited', status: 0, output: '' }),
    // The ladder's step 2, injected: these tests are about steps 1 and 3, and the host running
    // them has neither launcher. A test that means "not on PATH" overrides this with `() => null`.
    findLauncher: (launcher) => `/usr/bin/${launcher}`,
    ...over,
  });

  it('native Windows: no subprocess, both pairings named, and the two courses offered (REQ-SANDBOX-073)', async () => {
    let spawned = false;
    const verdict = await probeOnce(base('win32', { runTrial: async () => { spawned = true; return { kind: 'exited', status: 0, output: '' }; } }));
    expect(spawned).toBe(false);
    expect(verdict).toMatchObject({ available: false, backend: 'unavailable' });
    expect(verdict.reason).toContain('native Windows');
    expect(verdict.reason).toContain('Seatbelt');
    expect(verdict.reason).toContain('bubblewrap');
    expect(verdict.remediation).toContain('WSL2');
    expect(verdict.remediation).toContain('sudo apt-get install bubblewrap');
    expect(verdict.remediation).toContain('runtime.sandbox_mode');
  });

  it('an unrecognised identifier is quoted and the host is not called Windows (REQ-SANDBOX-073)', async () => {
    const verdict = await probeOnce(base('freebsd'));
    expect(verdict.reason).toContain(`'freebsd'`);
    expect(verdict.reason).not.toContain('Windows');
    expect(verdict.remediation).toContain('macOS');
    expect(verdict.remediation).toContain('Linux');
  });

  it('the mechanism is chosen BEFORE PATH is consulted, so macOS without the launcher still names Seatbelt', async () => {
    const verdict = await probeOnce(base('darwin', { env: { PATH: '' }, findLauncher: () => null }));
    expect(verdict.backend).toBe('seatbelt');
    expect(verdict.reason).toContain('sandbox-exec');
    expect(verdict.remediation).toContain('/usr/bin');
  });

  it('a missing bwrap quotes both install lines and spawns nothing (REQ-SANDBOX-066, -073)', async () => {
    let spawned = false;
    const verdict = await probeOnce(base('linux', { env: { PATH: '' }, findLauncher: () => null, runTrial: async () => { spawned = true; return { kind: 'timeout' }; } }));
    expect(spawned).toBe(false);
    expect(verdict.backend).toBe('bubblewrap');
    expect(verdict.remediation).toContain('sudo apt-get install bubblewrap');
    expect(verdict.remediation).toContain('sudo dnf install bubblewrap');
  });

  it('the Linux trial ends in the session tokens, never a bare -- true (REQ-SANDBOX-070)', () => {
    const line = trialLine('bubblewrap');
    expect(line.endsWith(`-- /bin/sh -c 'true'`)).toBe(true);
    expect(line).not.toMatch(/-- true$/);
    expect(line).toContain('--unshare-net');
    expect(line).toContain('--ro-bind');
    // No carve-outs, no writable roots.
    expect(line).not.toContain('--ro-bind-try');
    expect(line).not.toContain('--bind ');
  });

  it('the macOS trial stays the literal line REQ-SANDBOX-073 offers by hand (REQ-SANDBOX-070)', () => {
    expect(trialLine('seatbelt')).toBe(SEATBELT_TRIAL);
    expect(SEATBELT_TRIAL).toBe(`sandbox-exec -p "(version 1)(allow default)" /usr/bin/true`);
  });

  it('exit 0 inside the timeout is the one success criterion, whatever it wrote (REQ-SANDBOX-068)', async () => {
    const verdict = await probeOnce(base('linux', { runTrial: async () => ({ kind: 'exited', status: 0, output: 'bwrap: chatter\nmore' }) }));
    expect(verdict).toEqual({ available: true, backend: 'bubblewrap', reason: '', remediation: '' });
  });

  it('names which of the four outcomes occurred (REQ-SANDBOX-068)', async () => {
    const timeout = await probeOnce(base('linux', { runTrial: async () => ({ kind: 'timeout' }) }));
    expect(timeout.reason).toContain('did not finish within 5 seconds');

    const cannotStart = await probeOnce(base('linux', { runTrial: async () => ({ kind: 'launch-error', message: 'EACCES' }) }));
    expect(cannotStart.reason).toContain('could not be started at all');
    expect(cannotStart.reason).toContain('EACCES');

    const withOutput = await probeOnce(base('linux', { runTrial: async () => ({ kind: 'exited', status: 1, output: '\n  bwrap: No permissions to creating new namespace\nsecond line\n' }) }));
    expect(withOutput.reason).toContain('status 1');
    expect(withOutput.reason).toContain('bwrap: No permissions to creating new namespace');
    expect(withOutput.reason).not.toContain('second line');

    const noOutput = await probeOnce(base('linux', { runTrial: async () => ({ kind: 'exited', status: 7, output: '   \n' }) }));
    expect(noOutput.reason).toContain('status 7');
    expect(noOutput.reason).toContain('no output');
  });

  it('a bubblewrap trial failure names the two namespace controls and the by-hand line (REQ-SANDBOX-073)', async () => {
    const verdict = await probeOnce(base('linux', { runTrial: async () => ({ kind: 'exited', status: 1, output: 'bwrap: nope' }) }));
    expect(verdict.remediation).toContain('kernel.apparmor_restrict_unprivileged_userns');
    expect(verdict.remediation).toContain('/proc/sys/kernel/unprivileged_userns_clone');
    expect(verdict.remediation).toContain(BWRAP_BY_HAND);
    expect(verdict.remediation).toContain('keeps failing');
    // Never that its runs proceed unconfined (REQ-SANDBOX-074, -084).
    expect(verdict.remediation).not.toContain('unconfined');
  });

  it('a Seatbelt trial failure offers its own by-hand line (REQ-SANDBOX-073)', async () => {
    const verdict = await probeOnce(base('darwin', { runTrial: async () => ({ kind: 'exited', status: 1, output: 'sandbox-exec: nope' }) }));
    expect(verdict.remediation).toContain(SEATBELT_TRIAL);
  });

  it('renders the reason then the remediation on its own line (REQ-SANDBOX-072)', () => {
    expect(renderUnavailability({ available: false, backend: 'unavailable', reason: 'R.', remediation: 'M.' })).toBe('R.\nM.');
    expect(renderUnavailability({ available: false, backend: 'unavailable', reason: 'R.', remediation: '' })).toBe('R.');
    expect(renderUnavailability({ available: false, backend: 'unavailable', reason: '', remediation: '' })).toContain('No OS-level confinement');
  });
});

describe('the cached verdict (REQ-SANDBOX-067, -129)', () => {
  const service = (count: { n: number }, platform = 'linux'): ConfinementService => new ConfinementService({
    platform, env: { PATH: '/usr/bin' }, clocks: new FakeClock(), findLauncher: (l) => `/usr/bin/${l}`,
    runTrial: async () => { count.n += 1; return { kind: 'exited', status: 0, output: '' }; },
  });

  it('runs the trial at most once per process and caches the verdict', async () => {
    const count = { n: 0 };
    const s = service(count);
    expect(s.peek()).toBeNull();
    await Promise.all([s.verdict(), s.verdict(), s.verdict()]);
    await s.verdict();
    expect(count.n).toBe(1);
    expect(s.peek()?.available).toBe(true);
  });

  it('a re-check discards the cached verdict and probes afresh (REQ-SANDBOX-129)', async () => {
    const count = { n: 0 };
    const s = service(count);
    await s.verdict();
    await s.recheck();
    expect(count.n).toBe(2);
  });

  it('a Windows service never spawns, however often it is asked', async () => {
    const count = { n: 0 };
    const s = service(count, 'win32');
    await s.verdict();
    await s.recheck();
    expect(count.n).toBe(0);
    expect(s.peek()?.backend).toBe('unavailable');
  });
});

describe('the status pair and the refusal (REQ-SANDBOX-093, -074, -083)', () => {
  it('active requires selected AND available; selection alone is insufficient', () => {
    expect(confinementStatus('off', available('bubblewrap'))).toEqual({ active: false, backend: '' });
    expect(confinementStatus('workspace-write', null)).toEqual({ active: false, backend: '' });
    expect(confinementStatus('workspace-write', { available: false, backend: 'bubblewrap', reason: 'r', remediation: 'm' })).toEqual({ active: false, backend: '' });
    expect(confinementStatus('workspace-write', available('bubblewrap'))).toEqual({ active: true, backend: 'bubblewrap' });
    expect(confinementStatus('read-only', available('seatbelt'))).toEqual({ active: true, backend: 'seatbelt' });
  });

  it('wrapping yields a NEW command string or throws; it never yields the original (REQ-SANDBOX-074)', () => {
    const spec = { mode: 'workspace-write' as const, executionRoot: '/ws', writableRoots: [], allowNetwork: false };
    const wrapped = wrapForConfinement({ spec, verdict: available('bubblewrap') }, 'ls', nothing);
    expect(wrapped.line).not.toBe('ls');
    expect(wrapped.line.startsWith('bwrap ')).toBe(true);

    expect(() => wrapForConfinement({ spec, verdict: { available: false, backend: 'bubblewrap', reason: 'R.', remediation: 'M.' } }, 'ls', nothing))
      .toThrow(SandboxUnavailableError);
  });

  it('the thrown error carries REQ-SANDBOX-072 text and the fixed class name', () => {
    try {
      wrapForConfinement({ spec: { mode: 'read-only', executionRoot: '/ws', writableRoots: [], allowNetwork: false }, verdict: { available: false, backend: 'unavailable', reason: 'R.', remediation: 'M.' } }, 'ls', nothing);
      expect.unreachable('wrapping must not return');
    } catch (error) {
      expect((error as Error).name).toBe('SandboxUnavailableError');
      expect((error as Error).message).toBe('R.\nM.');
    }
  });
});

describe('the launcher-prefix test (REQ-SANDBOX-085)', () => {
  it('relabels only when EVERY non-empty line, on either stream, carries a launcher prefix', () => {
    expect(outputIsLauncherOnly('bwrap: No permissions')).toBe(true);
    expect(outputIsLauncherOnly('  sandbox-exec: bad profile\nsandbox_apply: failed  ')).toBe(true);
    // One ordinary line on either stream prevents relabelling — the command produced output of its own.
    expect(outputIsLauncherOnly('hello\nbwrap: No permissions')).toBe(false);
    expect(outputIsLauncherOnly('bwrap: No permissions\nhello')).toBe(false);
    // A command that produced no output at all is not relabelled either.
    expect(outputIsLauncherOnly('')).toBe(false);
    expect(outputIsLauncherOnly('   \n \n')).toBe(false);
  });
});
