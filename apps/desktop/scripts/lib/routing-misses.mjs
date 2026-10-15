/**
 * PD-TOOLS-006 revision 8 (OQ-250, ruled 2026-10-07 under the owner's delegation, R-072): the two counts OQ-216's measure is read
 * by, over every preserved session — each `delegate` refused because its `write_scope` named a persona that cannot write files
 * (revision 3's refusal: the routing table sent a write to a reader, the duress run at a68f121's call 115), and each call a child
 * made of a tool it does not hold, refused at the gate as unknown (a brief offered it a command its entry lacks, that run's call
 * 114 then call 164). The unknown-tool count's target is 0.
 *
 * Since OQ-257 (`PD-TOOLS-006` revision 9, ruled 2026-10-13 under R-072) the write-scope count is read against a bound, not a
 * target of zero: each refusal answered by the coordinator's next `delegate`, which re-routes the work — an accepted delegation to
 * another persona, or to the same one without a scope. Each refusal carries the seconds to that next `delegate` (between the two
 * calls' recorded ends) and whether it re-routed. The falsified target, kept beside it: "0 write-scope refusals" — the duress run
 * at 552d346 had one (#92, `architect`), refused in 5 ms and re-routed by the next `delegate` 30.0 s later.
 *
 * Since OQ-331 (ruled 2026-10-15 under R-072; revision 9 stands) the bound is counted per task: at most one refusal for each task
 * of the scenario's request whose route names a persona that writes no files — `nonWriterFileTasks`, which live-run.mjs supplies
 * from the scenario (2 in duress, docs/decisions.md and docs/verification.md; 0 in every other scenario, and 0 when absent). The
 * falsified bound, kept beside it: OQ-257's "at most one refusal per duress run" — the duress run at 2fe0a837 had two (call 105,
 * `architect`, re-routed 26.9 s later; call 231, `verifier`, re-routed 15.9 s later), every other limb holding. `flagged` names a
 * scenario over the bound: more refusals in a run than its `nonWriterFileTasks`; the same work refused twice in one run (the same
 * set of `write_scope` paths, or the same `task_name`); a refusal re-routed more than 60 s later; a refusal with no later
 * `delegate` by the same agent; or one whose next `delegate` does not re-route it.
 *
 * Since OQ-334 (`PD-TOOLS-006` revision 10, ruled 2026-10-15 under R-072) two more counts, in every run, default and duress, each
 * with a target of 0: `unknownArtifactWrites`, a child's call of an `artifact_write` it does not hold (one of `unknownTools`, the
 * default run at 3c03287 had one, d0c3a7f0 #10); and `publishBriefs`, a `delegate` brief asking a persona whose catalogue entry
 * lacks "publishes artifacts" to publish an artifact (that run's #5, "Publish your findings as an artifact so later steps can
 * attach it.", to a codebase-analyst). `publishers` names the personas whose entry carried the word in the delegate description
 * the run was offered (`publishersOf`); none under the defaults (OQ-212).
 *
 * `sessions`: `{ scenario, nonWriterFileTasks?: number, publishers?: string[], rootNames: string[], calls: { ordinal, tool_name, agent_name, status, result, failureKind, args?, endedAt? }[] }[]`.
 */
export function routingMissReading(sessions) {
  const scopeRefusals = [];
  const unknownTools = [];
  const publishBriefs = [];
  const flagged = [];
  for (const s of sessions) {
    const roots = new Set(s.rootNames ?? []);
    const publishers = new Set(Array.isArray(s.publishers) ? s.publishers : []);
    const calls = s.calls ?? [];
    const bound = Number.isInteger(s.nonWriterFileTasks) && s.nonWriterFileTasks >= 0 ? s.nonWriterFileTasks : 0;
    const refusedWork = [];
    let refusedHere = 0;
    for (let i = 0; i < calls.length; i += 1) {
      const c = calls[i];
      const result = String(c.result ?? '');
      if (c.tool_name === 'delegate' && /rejected — write_scope was given to '[^']+', which cannot write files/.test(result)) {
        const persona = /write_scope was given to '([^']+)'/.exec(result)?.[1] ?? '?';
        const next = calls.slice(i + 1).find((n) => n.tool_name === 'delegate' && n.agent_name === c.agent_name);
        const accepted = next !== undefined && !/rejected — /.test(String(next.result ?? ''));
        const scope = next?.args?.write_scope;
        const rerouted = accepted && (next.args?.persona !== persona || !Array.isArray(scope) || scope.length === 0);
        const secondsToNext = next !== undefined && typeof next.endedAt === 'number' && typeof c.endedAt === 'number' ? Math.round((next.endedAt - c.endedAt) / 100) / 10 : null;
        scopeRefusals.push({ scenario: s.scenario, ordinal: c.ordinal, persona, secondsToNext, rerouted });
        refusedHere += 1;
        if (!rerouted) flagged.push({ scenario: s.scenario, ordinal: c.ordinal, why: next === undefined ? 'no later delegate by the same agent' : 'the next delegate did not re-route the work' });
        const paths = Array.isArray(c.args?.write_scope) && c.args.write_scope.length > 0 ? [...new Set(c.args.write_scope.map(String))].sort().join('\n') : null;
        const taskName = typeof c.args?.task_name === 'string' && c.args.task_name !== '' ? c.args.task_name : /^Task '([^']+)'/.exec(result)?.[1] ?? null;
        const before = refusedWork.find((w) => (paths !== null && w.paths === paths) || (taskName !== null && w.taskName === taskName));
        if (before !== undefined) flagged.push({ scenario: s.scenario, ordinal: c.ordinal, why: `the same work was refused before (#${before.ordinal})` });
        refusedWork.push({ ordinal: c.ordinal, paths, taskName });
        if (secondsToNext !== null && secondsToNext > 60) flagged.push({ scenario: s.scenario, ordinal: c.ordinal, why: `${rerouted ? 're-routed' : 'the next delegate came'} ${secondsToNext} s later, over 60 s` });
      }
      // OQ-334: a brief the run delivered (not a call refused at its schema) asking a non-publisher to publish an artifact.
      if (c.tool_name === 'delegate' && typeof c.args?.task === 'string' && !/do not match its schema/.test(result) && asksToPublish(c.args.task)) {
        const persona = typeof c.args.persona === 'string' ? c.args.persona : '?';
        if (!publishers.has(persona)) publishBriefs.push({ scenario: s.scenario, ordinal: c.ordinal, persona });
      }
      if (!roots.has(c.agent_name) && /^Unknown tool '[^']+'\./.test(result)) {
        unknownTools.push({ scenario: s.scenario, ordinal: c.ordinal, agent: c.agent_name, tool: c.tool_name });
      }
    }
    if (refusedHere > bound) flagged.push({ scenario: s.scenario, ordinal: null, why: `${refusedHere} write-scope refusal${refusedHere === 1 ? '' : 's'} in one run, over its ${bound} task(s) routed to a persona that writes no files` });
  }
  const unknownArtifactWrites = unknownTools.filter((u) => u.tool === 'artifact_write');
  return { read: sessions.map((s) => s.scenario), scopeRefusals, unknownTools, unknownArtifactWrites, publishBriefs, flagged };
}

/** PD-TOOLS-006 revision 10 (OQ-334): the word a catalogue entry carries where its child's resolved grant holds `artifact_write`. */
export const PUBLISHES_ARTIFACTS = 'publishes artifacts';

/**
 * OQ-334: the personas a `delegate` description's catalogue names as publishing — each `name (words)` entry whose words include
 * "publishes artifacts".
 * @param {string} description
 * @returns {string[]}
 */
export function publishersOf(description) {
  const out = [];
  for (const m of String(description ?? '').matchAll(/([A-Za-z0-9][\w.-]*) \(([^()]*)\)/g)) {
    if (m[2].split(', ').includes(PUBLISHES_ARTIFACTS) && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/**
 * OQ-334: whether a brief asks its child to publish an artifact — an imperative "publish" followed within the sentence by
 * "artifact", or the tool's own name — and not where the clause forbids it ("Do not publish …") or names one already published.
 * @param {string} task
 */
export function asksToPublish(task) {
  const text = String(task ?? '');
  if (/\bartifact_write\b/.test(text)) return true;
  for (const m of text.matchAll(/\bpublish\b[^.\n]{0,60}\bartifacts?\b/gi)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 24), m.index ?? 0);
    if (!/\b(?:not|never|no)\b[^.\n]*$/i.test(before)) return true;
  }
  return false;
}
