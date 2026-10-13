/**
 * `PD-TOOLS-006` revision 9 (OQ-256, ruled 2026-10-13 under the owner's delegation, R-072): each answer a hand-off block cut,
 * read from the children's recorded messages by the marker the block ends a cut answer with ("… [hand-off cut: <given> of
 * <total> characters of <name>'s answer …"). In the duress run at 552d346 the inherited-context block cut the architect's
 * 28,330-character answer to 4,000 characters (finding V1); since revision 9 an answer is cut only past the 100,000-character
 * budget, so the target is 0 cuts for answers under that budget.
 *
 * `sessions`: `{ scenario, rootIds: string[], messages: { task_id, body }[] }[]`. A marker is counted once per child and answer,
 * however many of its messages repeat it (a retry's payload carries the block again).
 */
const MARKER = /\[hand-off cut: (\d+) of (\d+) characters of (.+?)'s answer are given here/g;

export function handOffCutReading(sessions) {
  const cuts = [];
  for (const s of sessions) {
    const roots = new Set(s.rootIds ?? []);
    const seen = new Set();
    for (const m of s.messages ?? []) {
      if (roots.has(m.task_id)) continue;
      for (const hit of String(m.body ?? '').matchAll(MARKER)) {
        const key = `${m.task_id}\u0000${hit[3]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        cuts.push({ scenario: s.scenario, child: m.task_id, answer: hit[3], given: Number(hit[1]), total: Number(hit[2]) });
      }
    }
  }
  return { read: sessions.map((s) => s.scenario), cuts, underBudget: cuts.filter((c) => c.total <= 100_000) };
}
