/**
 * The reader a live run and `git-proof` use to say that each fact reaches the application log once (PD-MONITOR-002,
 * live-run finding a71-9). The lines below are the shapes the 2026-10-01 duress pack carried in pairs (`duress/app.log`
 * lines 10/11, 12/13, 28/29 and 36/37), the instants and paths changed.
 */
import { describe, expect, it } from 'vitest';
import { appLogRecord, restatedFacts } from './restated-facts.mjs';

const at = (n: number) => `[main 2026-10-01T03:15:39.${String(500 + n).padStart(3, '0')}Z]`;
const OWNERS = [
  `${at(0)} info    workspace service: repository /tmp/w: git=true repo=true branch=main base=- +0/-0 touched=0 uncommitted=0 in 41 ms`,
  `${at(1)} info    workspace service: git view: 9 reads in 73 ms (/tmp/w: git=true repo=true branch=main upstream=- +0/-0 worktrees=1 history=3 uncommitted=0)`,
  `${at(2)} info    run host: mcp setup: index succeeded (2271 ms)`,
  `${at(3)} info    run host: credentials: leased for openai-compatible--katalyst (workspace /tmp/w)`,
];
const RESTATEMENTS = [
  `${at(4)} info    repository /tmp/w: git=true repo=true branch=main base=- +0/-0 touched=0 uncommitted=0 in 41 ms`,
  `${at(5)} info    git view: 9 reads in 73 ms (git=true repo=true branch=main +0/-0 worktrees=1 history=3)`,
  `${at(6)} info    run host: mcp setup: index succeeded in 2271 ms`,
  `${at(7)} info    credentials leased: openai-compatible--katalyst`,
];

describe('restatedFacts — each fact the application log carries, from its one emitter', () => {
  it('finds nothing in a log that carries only the owners\' lines', () => {
    expect(restatedFacts([...OWNERS, `${at(9)} info    run host hello: pid 7`].join('\n'))).toEqual([]);
  });

  it('names each of the four restatements the 2026-10-01 packs carried, by line, fact and owner', () => {
    const found = restatedFacts([...OWNERS, ...RESTATEMENTS].join('\n'));
    expect(found.map((f) => [f.line, f.fact, f.owner])).toEqual([
      [5, 'the repository read', 'workspace service'],
      [6, 'the Git view', 'workspace service'],
      [7, 'a setup step\'s outcome', 'run host (its step reporter)'],
      [8, 'the credentials lease', 'run host'],
    ]);
  });

  it('reads CRLF output and ignores what is not an application-log record', () => {
    expect(restatedFacts(`stray output\r\n${RESTATEMENTS[0]}\r\n`)).toHaveLength(1);
    expect(appLogRecord('git view: 9 reads in 73 ms')).toBeNull();
  });

  it('tells a forwarded line from main\'s own by its source, so the owner\'s line is never taken for the restatement', () => {
    expect(appLogRecord(OWNERS[1]!)).toMatchObject({ source: 'workspace service' });
    expect(appLogRecord(RESTATEMENTS[1]!)).toMatchObject({ source: null });
    expect(appLogRecord(`${at(9)} warning run host hello: late`)).toMatchObject({ source: null, message: 'run host hello: late' });
  });
});
