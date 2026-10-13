// @ts-check
/**
 * The live run's `delegation` scenario's readers (`live-run.mjs`): what the store and the recorded model traffic say about
 * five delegation features no live run had asked before the 2026-10-13 survey (item N57) — a settled child followed up by
 * `session_id` (PD-TOOLS-006 revision 3, PD-ORCH-005 clause 22), artifacts attached to a delegation (PD-TOOLS-006 revision
 * 5), a caller's `delegates_to` (OQ-229), the `swarm` strategy (PD-ORCH-006 revision 3, REQ-ORCH-025) and an edited artifact
 * handed to the next run (PD-LIBRARY-003 (e)).
 *
 * They live here so a test pins each against the shapes the product records: a reader that no longer matches its own
 * record turns its check into a NOTE ("not asked") over a green run, which is the failure a live run must never hide.
 * Every reader answers a `kind`: the scenario fails what the product got wrong and notes what the model never asked.
 *
 * Nothing here is product code. It runs only from the live run and its test.
 */

/**
 * One recorded chat-completions request, read: the system text, the first user message's text, and each offered tool's name
 * and description. The traffic record keeps the body as the product sent it (OpenAI-compatible: `messages`, `tools` of
 * `{ type: 'function', function: { name, description } }`).
 * @param {{ requestBody?: unknown }} record
 */
export function requestOf(record) {
  let body;
  try { body = JSON.parse(String(record.requestBody ?? '')); } catch { return null; }
  if (body === null || typeof body !== 'object' || !Array.isArray(body.messages)) return null;
  const text = (/** @type {any} */ m) => (typeof m?.content === 'string' ? m.content : Array.isArray(m?.content) ? m.content.map((/** @type {any} */ p) => (typeof p?.text === 'string' ? p.text : '')).join('') : '');
  const system = body.messages[0]?.role === 'system' ? text(body.messages[0]) : '';
  const firstUser = text(body.messages.find((/** @type {any} */ m) => m?.role === 'user'));
  const tools = (Array.isArray(body.tools) ? body.tools : []).map((/** @type {any} */ t) => ({ name: String(t?.function?.name ?? t?.name ?? ''), description: String(t?.function?.description ?? t?.description ?? '') }));
  return { system, firstUser, tools };
}

/** The statement a granted run's coordinator is given (PD-ORCH-006), and the swarm layer's heading (REQ-ORCH-025). */
export const DIRECT_WORK_STATEMENT = 'For this run you hold the tools to read and write files and run commands yourself';
export const SWARM_HEADING = '## Run override: `swarm`';
/** REQ-ORCH-025's coordination-only set withholds these from a coordinating run (REQ-TOOLS-006's write and command names). */
export const WRITING_TOOLS = Object.freeze(['write_file', 'haet_edit', 'haet', 'terminal']);

/**
 * What a `swarm` run's coordinator was told, from its first request (PD-ORCH-006 revision 3):
 * - `granted`: the mapping granted the direct-work bundle; then the run carries the direct-work statement, no swarm layer, and
 *   is offered the writing tools beside `delegate` — `faults` lists what it did not.
 * - `coordinating`: the mapping did not grant it; then REQ-ORCH-025's swarm governs — the layer, no direct-work statement,
 *   `delegate` offered and no writing tool — and `faults` lists what it did not.
 * - `absent`: no request was read — a NOTE.
 * @param {ReturnType<typeof requestOf>} first
 */
export function swarmReading(first) {
  if (first === null) return { kind: 'absent', faults: [], offered: [] };
  const offered = first.tools.map((t) => t.name);
  const layer = first.system.includes(SWARM_HEADING);
  const direct = first.system.includes(DIRECT_WORK_STATEMENT);
  const writing = offered.filter((t) => WRITING_TOOLS.includes(t));
  /** @type {string[]} */
  const faults = [];
  if (direct) {
    if (layer) faults.push('the granted run carries the swarm layer beside the direct-work statement');
    for (const t of ['write_file', 'terminal', 'delegate']) if (!offered.includes(t)) faults.push(`the granted run was not offered ${t}`);
    return { kind: 'granted', faults, offered };
  }
  if (!layer) faults.push('the coordinating swarm run carries no swarm layer');
  if (!offered.includes('delegate')) faults.push('the coordinating run was not offered delegate');
  if (writing.length > 0) faults.push(`the coordination-only set offered ${writing.join(', ')}`);
  return { kind: 'coordinating', faults, offered };
}

/**
 * The `delegate` catalogue a `delegates_to` narrowing must leave (OQ-229): the description says the list narrows it, and names
 * no persona outside it. `delegates`: the delegate calls (`{ args, result, status }`); a call to another persona must have been
 * refused naming the list. `kind`: `narrowed`, `not-offered` (no request offered `delegate`: a NOTE) or `wide` (a FAIL).
 * @param {readonly (ReturnType<typeof requestOf>)[]} requests the root's requests
 * @param {readonly string[]} list the configured `delegates_to`
 * @param {readonly { args: any, result: string, status: string }[]} delegates
 * @param {readonly string[]} known every delegation target of the configuration, to find one named outside the list
 */
export function delegatesToReading(requests, list, delegates, known) {
  const description = requests.map((r) => r?.tools.find((t) => t.name === 'delegate')?.description ?? null).find((d) => d !== null) ?? null;
  const outside = delegates.filter((d) => typeof d.args?.persona === 'string' && d.args.persona !== '' && d.args.session_id === undefined && !list.includes(d.args.persona));
  const admittedOutside = outside.filter((d) => !/is not a persona .* may delegate to: its delegates_to lists/.test(d.result));
  if (description === null) return { kind: 'not-offered', outside: outside.length, admittedOutside: admittedOutside.length, named: [] };
  const says = description.includes(`Your delegates_to (${list.join(', ')}) narrows this list`);
  const named = known.filter((p) => !list.includes(p) && description.includes(`${p} (`));
  return { kind: says && named.length === 0 ? 'narrowed' : 'wide', says, named, outside: outside.length, admittedOutside: admittedOutside.length };
}

/**
 * A settled child followed up by `session_id` (PD-TOOLS-006 revision 3, PD-ORCH-005 clause 22): the delegate calls carrying a
 * `session_id`, each read against the child it names. `kind`: `followed` (at least one follow-up was accepted, said so, kept
 * the child's task id — no second child row of that name — and left a `child_resumed` entry with `follow_up`), `refused`
 * (every one was refused; the reasons are listed: a NOTE where the model named no settled child, else a FAIL), `not-asked`.
 * @param {readonly { ordinal: number, args: any, result: string, status: string }[]} delegates
 * @param {readonly { task_id: string, canonical_name: string, state: string }[]} children
 * @param {readonly { name: string, metadata: any }[]} timeline
 */
export function followUpReading(delegates, children, timeline) {
  const asked = delegates.filter((d) => typeof d.args?.session_id === 'string' && d.args.session_id !== '');
  if (asked.length === 0) return { kind: 'not-asked', asked: 0, accepted: [], refused: [], faults: [] };
  const accepted = asked.filter((d) => /Following up .* it resumes from its record under its own task id/.test(d.result));
  const refused = asked.filter((d) => !accepted.includes(d));
  /** @type {string[]} */
  const faults = [];
  for (const d of accepted) {
    const id = d.args.session_id;
    const child = children.find((c) => c.task_id === id);
    if (!child) { faults.push(`#${d.ordinal}: no child row holds ${id}`); continue; }
    if (children.filter((c) => c.canonical_name === child.canonical_name).length !== 1) faults.push(`#${d.ordinal}: ${child.canonical_name} has more than one child row`);
    if (!timeline.some((t) => t.name === 'child_resumed' && t.metadata?.follow_up === true && t.metadata?.task_id === id)) faults.push(`#${d.ordinal}: no child_resumed entry says ${id} was followed up`);
  }
  return { kind: accepted.length > 0 ? 'followed' : 'refused', asked: asked.length, accepted: accepted.map((d) => d.ordinal), refused: refused.map((d) => ({ ordinal: d.ordinal, reason: d.result.split('\n')[0].slice(0, 200) })), faults };
}

/**
 * Artifacts attached to a delegation (PD-TOOLS-006 revision 5): the delegate calls with a non-empty `attach_artifacts`, each read
 * against the observation's selection and the child's `context_selection` entry. `kind`: `attached` (at least one attachment
 * was given whole and the entry agrees), `unresolved` (every one named nothing: a NOTE naming them), `not-asked`; `faults`
 * lists an observation and an entry that disagree.
 * @param {readonly { ordinal: number, args: any, result: string }[]} delegates
 * @param {readonly { task_id?: string, attached_included?: number, attached_elided?: string[], attached_unresolved?: string[] }[]} selections
 * @param {readonly { task_id: string, canonical_name: string }[]} children
 */
export function attachReading(delegates, selections, children) {
  const asked = delegates.filter((d) => Array.isArray(d.args?.attach_artifacts) && d.args.attach_artifacts.length > 0);
  if (asked.length === 0) return { kind: 'not-asked', asked: 0, given: 0, faults: [] };
  /** @type {string[]} */
  const faults = [];
  let given = 0;
  let unresolved = 0;
  for (const d of asked) {
    const whole = /(\d+) attached artifacts? will be given to the child whole/.exec(d.result);
    const n = whole ? Number(whole[1]) : 0;
    given += n;
    if (/could not be resolved/.test(d.result)) unresolved += 1;
    const child = children.find((c) => c.canonical_name === d.args.task_name);
    const entry = child ? selections.find((s) => s.task_id === child.task_id) : undefined;
    if (n > 0 && entry === undefined) faults.push(`#${d.ordinal}: no context_selection entry for ${d.args.task_name}`);
    else if (entry !== undefined && (entry.attached_included ?? 0) !== n) faults.push(`#${d.ordinal}: the observation gave ${n} whole, the entry ${entry.attached_included ?? 0}`);
  }
  return { kind: given > 0 ? 'attached' : unresolved > 0 ? 'unresolved' : 'none-given', asked: asked.length, given, faults };
}

/**
 * The handoff a continued session's fresh root is given (REQ-SESSION-115, PD-LIBRARY-003 (e)): its first user message names
 * the edited artifact with its header marked `edited`, carries the person's `marker`, and no frontmatter line. `kind`:
 * `carried`, `unedited` (the artifact is there, not marked edited: a FAIL), `other-artifact` (another artifact is the latest:
 * a NOTE), `absent`.
 * @param {string | null} firstUser
 * @param {string} artifactId
 * @param {string} marker
 */
export function handoffReading(firstUser, artifactId, marker) {
  if (firstUser === null || firstUser === '') return { kind: 'absent', header: null };
  const header = new RegExp(`Artifact: ${artifactId} — [^\\n]*\\(([^)]*)\\)`).exec(firstUser);
  if (header === null) return { kind: /Artifact: art_/.test(firstUser) ? 'other-artifact' : 'absent', header: (/Artifact: [^\n]*/.exec(firstUser) ?? [null])[0] };
  const after = firstUser.slice(header.index);
  const edited = /, edited$/.test(header[1] ?? '');
  const carriesMarker = after.slice(0, 6_200).includes(marker);
  const frontmatter = /^(?:id|slug|created_at|edited_at): "/m.test(after.slice(0, 1_500));
  return { kind: edited ? 'carried' : 'unedited', header: header[0], carriesMarker, frontmatter };
}
