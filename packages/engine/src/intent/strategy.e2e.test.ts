import { describe, expect, it } from 'vitest';
import type { SessionId } from '@rotaris/kernel';
import { answer, type ModelRequest } from '@rotaris/model';
import type { StrategyChoice } from '@rotaris/contracts';
import { dal, sessionsWith, useIterationStore } from '../children/children.test-support.js';

/** PD-ORCH-020 against the run: the choice is made first, and the run is then a run of the chosen strategy. */
describe('an intelligent run, end to end against the run (PD-ORCH-020)', () => {
  useIterationStore();

  const systemOf = (req: ModelRequest): string => req.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '';
  const rowsOf = (sid: SessionId): string[] => dal.residentRows(sid).map((r) => r.body);
  const LEADS = 'Do the work yourself by default';

  const run = async (choice: StrategyChoice | Error, prompt = 'do the thing') => {
    const systems: string[] = [];
    const asked: string[] = [];
    let classified = 0;
    const { sessions } = sessionsWith((persona, _turn, req) => {
      if (persona === 'orchestrator') systems.push(systemOf(req));
      return answer('Done.');
    }, { chooseStrategy: async (p) => { asked.push(p); if (choice instanceof Error) throw choice; return choice; }, preflight: () => { classified += 1; } });
    const sid = (sessions.start(dal, 'C:/ws', prompt) as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    return { sid, sessions, systems, asked, classified: () => classified };
  };

  it('clauses 1, 5 and 6: `lead` chosen — asked once with the request, said in a row, never classified, and the entry role is told it leads', async () => {
    const r = await run({ strategy: 'lead', reason: 'a bug to find and fix', fallback: false });
    expect(r.asked).toEqual(['do the thing']);
    expect(rowsOf(r.sid)).toContain('Strategy chosen: lead (a bug to find and fix)');
    expect(r.classified()).toBe(0);
    expect(r.systems[0]).toContain(LEADS);
    expect(dal.timelineOf(r.sid).filter((t) => t.name === 'run_strategy_chosen').map((t) => JSON.parse(t.metadata ?? '{}'))).toEqual([{ strategy: 'lead', reason: 'a bug to find and fix', fallback: false, kept: false }]);
  });

  it('clause 5: `orchestrator` chosen — the run is classified next and its entry role is not told it leads', async () => {
    const r = await run({ strategy: 'orchestrator', reason: 'a whole project', fallback: false });
    expect(rowsOf(r.sid)).toContain('Strategy chosen: orchestrator (a whole project)');
    expect(r.classified()).toBe(1);
    expect(r.systems[0]).not.toContain(LEADS);
  });

  it('clause 4: a choice that raises or falls back leaves the run on `lead`, and the row says why', async () => {
    const raised = await run(new Error('no route to the model'));
    expect(rowsOf(raised.sid).find((t) => t.startsWith('Strategy chosen:'))).toMatch(/^Strategy chosen: lead \(not chosen: the choice raised: .*no route to the model/);
    expect(raised.systems[0]).toContain(LEADS);
    const fell = await run({ strategy: 'lead', reason: 'the call timed out after 12 s', fallback: true });
    expect(rowsOf(fell.sid)).toContain('Strategy chosen: lead (not chosen: the call timed out after 12 s)');
  });
});
