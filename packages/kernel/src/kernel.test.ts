import { describe, expect, it } from 'vitest';
import { Budget, FakeClock, globToRegExp, millis, mintWorkspaceId, parseWorkspaceId, fileStamp, instant, ok, err, unwrap, REQ } from './index.js';

describe('kernel — Result', () => {
  it('unwrap returns the value of an Ok and throws on an Err', () => {
    expect(unwrap(ok(3))).toBe(3);
    expect(() => unwrap(err({ code: 'x', headline: 'no' }))).toThrow();
  });
});

describe('kernel — identifiers', () => {
  it('REQ-SESSION-197: a workspace identifier is v1- plus 32 lowercase hex, and nothing else parses', () => {
    const id = mintWorkspaceId('0123456789abcdef0123456789abcdef');
    expect(parseWorkspaceId(id)).toBe(id);
    expect(parseWorkspaceId('v1-XYZ')).toBeUndefined();
    expect(parseWorkspaceId('C:\\ws')).toBeUndefined();
    expect(() => mintWorkspaceId('short')).toThrow();
  });
});

describe('kernel — Budget (REQ-ORCH-124)', () => {
  it('the smaller budget governs, and expiring it does not reset the larger', () => {
    const clock = new FakeClock();
    const large = Budget.begin(clock.now(), millis(30_000));
    const small = Budget.begin(clock.now(), millis(2_000));
    const governing = large.min(small);
    expect(governing).toBe(small);
    clock.advance(2_000);
    expect(small.expired(clock.now())).toBe(true);
    expect(large.expired(clock.now())).toBe(false);
    expect(large.remaining(clock.now())).toBe(28_000);
  });
});

describe('kernel — FakeClock', () => {
  it('fires timers in deadline order as time advances, and a cancelled timer never fires', () => {
    const clock = new FakeClock();
    const fired: string[] = [];
    clock.after(millis(50), () => fired.push('b'));
    clock.after(millis(10), () => fired.push('a'));
    const c = clock.after(millis(20), () => fired.push('c'));
    c.cancel();
    clock.every(millis(30), () => fired.push('tick'));
    clock.advance(60);
    expect(fired).toEqual(['a', 'tick', 'b', 'tick']);
    expect(clock.now()).toBe(60);
  });
});

describe('kernel — file stamp (ADR-0058 step 8, D6)', () => {
  it('keeps milliseconds and contains no path-hostile characters', () => {
    const s = fileStamp(instant(Date.UTC(2026, 8, 2, 12, 34, 56, 789)));
    expect(s).toBe('2026-09-02T12-34-56-789Z');
    expect(s).not.toMatch(/[:.\\/]/);
  });
});

describe('kernel — generated requirement symbols (ADR-0040 #4)', () => {
  it('the symbol module is generated before collection and carries live identifiers', () => {
    expect(REQ['REQ-SESSION-197']).toBeDefined();
    expect(REQ['REQ-SHELL-023']).toBeDefined();
  });
});

describe('kernel — the glob dialect (REQ-TOOLS-138..141, PD-TOOLS-006)', () => {
  it('REQ-TOOLS-141: brace alternatives are globs, nested groups split at their own level, and an unclosed brace is literal', () => {
    expect(globToRegExp('{a,{b,c}}.ts').test('c.ts')).toBe(true);
    // A `/` inside an alternative stays a path separator.
    expect(globToRegExp('{x/y,z}.md').test('x/y.md')).toBe(true);
    expect(globToRegExp('{x/y,z}.md').test('z.md')).toBe(true);
    expect(globToRegExp('packages/*/{*.json,*.ts}').test('packages/kernel/package.json')).toBe(true);
    expect(globToRegExp('a{b').test('a{b')).toBe(true);
  });

  it('star stays inside one segment, double star crosses segments, and a leading ./ or / is dropped', () => {
    expect(globToRegExp('src/*.ts').test('src/a.ts')).toBe(true);
    expect(globToRegExp('src/*.ts').test('src/deep/a.ts')).toBe(false);
    expect(globToRegExp('src/**').test('src/deep/a.ts')).toBe(true);
    expect(globToRegExp('**/*.test.ts').test('a.test.ts')).toBe(true);
    expect(globToRegExp('./src/?.ts').test('src/a.ts')).toBe(true);
    expect(globToRegExp('src\\a.ts').test('src/a.ts')).toBe(true);
  });

  it('PD-TOOLS-006: matching is case-sensitive unless asked otherwise, as a write scope asks', () => {
    expect(globToRegExp('src/**').test('SRC/a.ts')).toBe(false);
    expect(globToRegExp('src/**', { caseInsensitive: true }).test('SRC/a.ts')).toBe(true);
  });
});
