/**
 * The reader a live run and `git-proof` use to say that each fact reaches the application log once (PD-MONITOR-002,
 * live-run finding a71-9). The lines below are the shapes the 2026-10-01 duress pack carried in pairs (`duress/app.log`
 * lines 10/11, 12/13, 28/29 and 36/37), the instants and paths changed.
 */
import { describe, expect, it } from 'vitest';
import { appLogRecord, KNOWN_RESTATEMENTS, restatedFacts } from './restated-facts.mjs';

const at = (n: number) => `[main 2026-10-01T03:15:39.${String(500 + n).padStart(3, '0')}Z]`;
const OWNERS = [
  `${at(0)} info    workspace service: repository /tmp/w: git=true repo=true branch=main base=- +0/-0 touched=0 uncommitted=0 in 41 ms`,
  `${at(1)} info    workspace service: git view: 9 reads in 73 ms (/tmp/w: git=true repo=true branch=main upstream=- +0/-0 worktrees=1 history=3 uncommitted=0)`,
  `${at(2)} info    run host: mcp setup: index succeeded (2271 ms)`,
  `${at(3)} info    run host: credentials: leased for openai-compatible--katalyst (workspace /tmp/w)`,
  `${at(10)} warning run host: mcp code_intelligence: tool discovery failed in 508 ms (Connection closed (code_intelligence exited with code 127; stderr: a | b)); the persona prompt will list this server with no tool details attached (REQ-MCP-048)`,
];
const RESTATEMENTS = [
  `${at(4)} info    repository /tmp/w: git=true repo=true branch=main base=- +0/-0 touched=0 uncommitted=0 in 41 ms`,
  `${at(5)} info    git view: 9 reads in 73 ms (git=true repo=true branch=main +0/-0 worktrees=1 history=3)`,
  `${at(6)} info    run host: mcp setup: index succeeded in 2271 ms`,
  `${at(7)} info    credentials leased: openai-compatible--katalyst`,
  // The 2026-10-03 duress pack (`duress/app.log` lines 37-42, finding U4): the run host's own line after the warning.
  `${at(11)} info    run host: mcp: discovery of 'code_intelligence' failed (Connection closed (code_intelligence exited with code 127; stderr: the bus: Failed to connect`,
];

describe('restatedFacts — each fact the application log carries, from its one emitter', () => {
  it('finds nothing in a log that carries only the owners\' lines', () => {
    expect(restatedFacts([...OWNERS, `${at(9)} info    run host hello: pid 7`].join('\n'))).toEqual([]);
  });

  it('names each of the five restatements the 2026-10-01 and 2026-10-03 packs carried, by line, fact and owner', () => {
    const found = restatedFacts([...OWNERS, ...RESTATEMENTS].join('\n'));
    expect(found.map((f) => [f.line, f.fact, f.owner])).toEqual([
      [6, 'the repository read', 'workspace service'],
      [7, 'the Git view', 'workspace service'],
      [8, 'a setup step\'s outcome', 'run host (its step reporter)'],
      [9, 'the credentials lease', 'run host'],
      [10, 'an MCP tool discovery\'s failure', 'run host (ToolDiscovery\'s REQ-MCP-048 warning)'],
    ]);
    expect(KNOWN_RESTATEMENTS).toBe(found.length);
  });

  it('takes a successful discovery\'s line for no restatement: only a failure has another owner', () => {
    expect(restatedFacts(`${at(12)} info    run host: mcp: discovery of 'alpha' listed 5 tool(s) in 75 ms`)).toEqual([]);
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
