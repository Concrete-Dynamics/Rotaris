import { accessSync, constants, existsSync, readFileSync, rmSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import type { DeliveryQueue, QueueEntry, ReqId, RequirementRecord, StoreParse } from '@rotaris/contracts';
import { compareReqIds, validateBranchName } from '@rotaris/contracts';
import { err, millis, ok, type Clocks, type Result } from '@rotaris/kernel';
import { replaceDocument } from '@rotaris/platform';
import { invokeGit, type GitResult } from '../git/invoke.js';
import { resolvedPath } from '../git/paths.js';
import { COLLISION_ATTEMPTS, createWorktree, gitFailureText, GIT_WRITE_TIMEOUT, isBranchCollision, type WorktreeDeps } from '../git/worktrees.js';
import { priorityRank } from './projection.js';

/**
 * Part AP — runs from the board and the queue, the workspace side (spec 08 §Runs Started from the Board, §Delivery
 * Queue, §Editing and Creating Requirements; ADR-0041's second execution). Everything here is either PURE (the
 * scheduler, the branch and path derivation, the document composer) or a named I/O unit the workspace service
 * calls from its process (the worktree provisioning through ADR-0038's one Git chokepoint, the source write through
 * ADR-0004's atomic replace). Nothing here holds a database handle: the delivery rows are the transition
 * function's (REQ-TRACE-399), and this module hands it what to record.
 *
 * The reading this Part takes of `manual` versus `automatic` (REQ-TRACE-479..483), stated once here and recorded
 * in ADR-0041's note: a requirement in the released column is a CANDIDATE; under `automatic` the scheduler picks
 * the next candidate up as capacity becomes available; under `manual` a candidate begins only after the user
 * releases it from the queue (`requirements.queue.set {release: id}`), which ARMS it — "when disabled, nothing
 * begins until the user releases it" (REQ-TRACE-482). Part AK's projection already read `manual` this way; this
 * module adds the arming, the per-requirement hold, the claim a dispatch in flight holds, and the reason a start
 * that did not begin leaves on the entry (REQ-TRACE-463).
 */

// ---- units, branches and directories (REQ-CONFIG-193, REQ-GIT-074/137/139/140) ----

/** One unit per release in this build (decomposition is not built); the unit id counts the runs the record has started. */
export function unitIdFor(unitsStarted: number): string {
  return `u${unitsStarted + 1}`;
}

/**
 * REQ-GIT-139's slug, exactly and in this order: fold to lower case; replace every maximal run of characters outside
 * `a`–`z`, `0`–`9`, `.`, `_` and `-` with a single `-`; strip leading and trailing `-` and `.`; truncate to 40 and strip
 * any `-` or `.` the truncation left at the end; nothing left → the single character `x`. EVERY value substituted into
 * a placeholder goes through it (the identifier and the unit included), so no substituted value can carry a `/`.
 */
export function slugOf(value: string): string {
  const folded = value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  const cut = folded.slice(0, 40).replace(/[-.]+$/, '');
  return cut === '' ? 'x' : cut;
}

export interface BranchNames { readonly requirementId: ReqId; readonly unitId: string; readonly slug: string }
export interface BranchSuffixes { readonly cycle?: number; readonly attempt?: number }

/**
 * REQ-GIT-074 / REQ-CONFIG-193 / REQ-GIT-139: both spellings of each placeholder, every substituted value slugged;
 * `-c<cycle>` appended for delivery cycles after the first and `-a<attempt>` for attempts from the second onward when the
 * template carries no `{attempt}` placeholder, the cycle suffix before the attempt suffix, neither suffix slugged. The
 * finished name is then REQ-GIT-009's normal form or its refusal (`validateBranchName`, derived — transformed, not typed).
 */
export function renderBranch(template: string, names: BranchNames, suffixes: BranchSuffixes = {}): Result<string, string> {
  const cycle = suffixes.cycle ?? 1;
  const attempt = suffixes.attempt ?? 1;
  const hasAttempt = template.includes('{attempt}');
  let rendered = template
    .replace(/\{requirement_id\}|\{req\}/g, slugOf(names.requirementId))
    .replace(/\{unit_id\}|\{unit\}/g, slugOf(names.unitId))
    .replace(/\{slug\}/g, slugOf(names.slug))
    .replace(/\{attempt\}/g, String(attempt));
  if (cycle >= 2) rendered += `-c${cycle}`;
  if (attempt >= 2 && !hasAttempt) rendered += `-a${attempt}`;
  const checked = validateBranchName(rendered, { derived: true });
  return checked.ok ? ok(checked.name) : err(`${checked.error} (${checked.detail})`);
}

export const REQUIREMENT_WORKTREES_SUBPATH = join('.rotaris', 'requirements', 'worktrees');

/** REQ-GIT-140: named for the attempt's own branch with each `/` replaced by `-`, directly under `<workspace>/.rotaris/requirements/worktrees/`. */
export function requirementWorktreePath(workspaceRoot: string, branch: string): string {
  return resolve(workspaceRoot, REQUIREMENT_WORKTREES_SUBPATH, branch.replace(/\//g, '-'));
}

export type RepositoryForRuns = { readonly ok: true; readonly head: string } | { readonly ok: false; readonly reason: string; readonly offerSetup: boolean };

/** REQ-TRACE-498's two repository rows: not a repository → a run has nothing to branch from (setting one up offered); no commit → the engine quoted. */
export const NOT_A_REPOSITORY = 'This workspace is not a version-controlled repository, so a run has nothing to branch from. Set up Git here first.';

async function git(args: readonly string[], cwd: string, deps: WorktreeDeps): Promise<GitResult> {
  return invokeGit({ args, workspaceRoot: cwd, timeoutMs: deps.timeoutMs ?? GIT_WRITE_TIMEOUT, timers: deps.clocks.timers, clock: deps.clocks.monotonic, ...(deps.env ? { env: deps.env } : {}), ...(deps.executable ? { executable: deps.executable } : {}) });
}
const okText = (r: GitResult): string | null => (r.outcome === 'exited' && r.status === 0 ? r.stdout.trim() : null);

export async function checkRepositoryForRuns(workspaceRoot: string, deps: WorktreeDeps): Promise<RepositoryForRuns> {
  const top = await git(['rev-parse', '--show-toplevel'], workspaceRoot, deps);
  const topText = okText(top);
  if (topText === null) {
    const text = gitFailureText(top, ['rev-parse', '--show-toplevel']);
    // Git's own wording for a folder outside any repository; a missing Git is its own failure and is quoted as such.
    if (/not a git repository/i.test(text)) return { ok: false, reason: NOT_A_REPOSITORY, offerSetup: true };
    return { ok: false, reason: `Git could not answer for this workspace: ${text}`, offerSetup: false };
  }
  const head = await git(['rev-parse', 'HEAD'], workspaceRoot, deps);
  const headText = okText(head);
  if (headText === null) return { ok: false, reason: `The repository holds no commit, so a run has nothing to branch from. Git reported: ${gitFailureText(head, ['rev-parse', 'HEAD'])}`, offerSetup: false };
  return { ok: true, head: headText };
}

export interface ProvisionArgs {
  readonly workspaceRoot: string;
  readonly id: ReqId;
  readonly unit: string;
  readonly title: string;
  readonly branchTemplate: string;
  /** REQ-GIT-139: the delivery cycle this unit belongs to (the second release of a requirement is cycle 2). */
  readonly cycle?: number;
}
export interface ProvisionedWorktree { readonly ref: string; readonly path: string; readonly branch: string; readonly baseBranch: string; readonly baseRevision: string }

/**
 * REQ-GIT-137/139/140: the branch from the template under `rotaris/req/`, the directory named for the attempt's OWN
 * branch — so a REQ-GIT-010 suffix re-derives the directory rather than reusing the first attempt's — then the read-back:
 * the new tree's top level and checked-out branch are compared with what was asked, and a mismatch fails provisioning
 * rather than returning the tree. A failure names the requirement REQ-TRACE-498 fixes where one applies.
 */
export async function provisionUnitWorktree(a: ProvisionArgs, deps: WorktreeDeps): Promise<Result<ProvisionedWorktree, string>> {
  const repo = await checkRepositoryForRuns(a.workspaceRoot, deps);
  if (!repo.ok) return err(repo.reason);
  const base = renderBranch(a.branchTemplate, { requirementId: a.id, unitId: a.unit, slug: a.title }, { cycle: a.cycle ?? 1 });
  if (!base.ok) return base;
  const platform = deps.platform ?? process.platform;
  // REQ-GIT-141: the base checkout's branch and revision, recorded before any requirement-execution Git work begins.
  const baseBranchBefore = okText(await git(['rev-parse', '--abbrev-ref', 'HEAD'], a.workspaceRoot, deps));
  const baseRevisionBefore = repo.head;
  for (let attempt = 1; attempt <= COLLISION_ATTEMPTS; attempt += 1) {
    // REQ-GIT-010's residual collision suffix (`-2`..`-50`) on top of REQ-GIT-139's rendering; the directory is derived per attempt (REQ-GIT-140).
    const branch = attempt === 1 ? base.value : `${base.value}-${attempt}`;
    const path = requirementWorktreePath(a.workspaceRoot, branch);
    const made = await createWorktree({ root: a.workspaceRoot, branch, path, collisionSafe: false, route: 'session' }, deps);
    if (!made.ok) {
      if (isBranchCollision(made.error)) continue;
      return err(made.error);
    }
    // REQ-GIT-141: read again after the work; a moved base fails the operation with both values reported. The tree stays as evidence (REQ-GIT-142).
    const baseBranchAfter = okText(await git(['rev-parse', '--abbrev-ref', 'HEAD'], a.workspaceRoot, deps));
    const baseRevisionAfter = okText(await git(['rev-parse', 'HEAD'], a.workspaceRoot, deps));
    if (baseBranchAfter !== baseBranchBefore || baseRevisionAfter !== baseRevisionBefore) {
      return err(`the base checkout moved from ${baseBranchBefore ?? '?'}@${baseRevisionBefore} to ${baseBranchAfter ?? '?'}@${baseRevisionAfter ?? '?'} while a requirement unit was running; provisioning of ${branch} was abandoned rather than completed.`);
    }
    // REQ-GIT-140's read-back, and REQ-TRACE-497's "a run started in the base tree" made unreachable.
    const top = okText(await git(['rev-parse', '--show-toplevel'], path, deps));
    const checkedOut = okText(await git(['rev-parse', '--abbrev-ref', 'HEAD'], path, deps));
    if (top === null || resolvedPath(top, platform) !== resolvedPath(path, platform) || checkedOut !== made.value.branch) {
      try { rmSync(path, { recursive: true, force: true }); } catch { /* the failure is reported; the directory is evidence of the attempt (REQ-GIT-142) */ }
      return err(`The provisioned worktree did not read back as requested (top level ${top ?? 'unknown'}, branch ${checkedOut ?? 'unknown'}; asked for ${path} on ${made.value.branch}); provisioning failed.`);
    }
    if (resolvedPath(path, platform) === resolvedPath(a.workspaceRoot, platform)) return err(`${path} resolves to the base checkout, and a requirement unit is never run there.`);
    return ok({ ref: `${a.id}/${a.unit}`, path, branch: made.value.branch, baseBranch: made.value.baseBranch, baseRevision: made.value.baseRevision });
  }
  return err(`Could not find a free branch name for ${base.value} after ${COLLISION_ATTEMPTS} attempts.`);
}

// ---- the scheduler (REQ-TRACE-478..483, 463) ----

export interface QueueCandidate { readonly id: ReqId; readonly unit: string; readonly priority: string | undefined; readonly since: string }
export interface ScheduleInput {
  /** Every requirement in the released column, in any order; the scheduler orders them. */
  readonly candidates: readonly QueueCandidate[];
  readonly executing: readonly { readonly id: ReqId; readonly unit: string }[];
  readonly settings: { readonly automatic: boolean; readonly concurrency: number; readonly stopped: boolean };
  /** REQ-TRACE-479's third control: held back until released. In memory; a restart releases every hold. */
  readonly held: ReadonlySet<ReqId>;
  /** Under `manual`: the candidates the user released from the queue and that have not begun yet. */
  readonly armed: ReadonlySet<ReqId>;
  /** A dispatch main holds and has not settled (`run.started` or `run.abandon`). */
  readonly claimed: ReadonlySet<ReqId>;
  /**
   * Defect AP-4 — REQ-TRACE-472/497: a candidate whose launch has no accepted disclosure CANNOT be claimed, so the
   * queue must never call it `next`. It is kept apart from `stalled` because arming does not clear it: arming is the
   * queue's release (REQ-TRACE-482), and the disclosure is the user's acceptance of what the run receives, which no
   * release can stand in for. Keyed by the sentence to state, which is the caller's, unaltered (REQ-TRACE-478).
   */
  readonly undisclosed: ReadonlyMap<ReqId, string>;
  /** REQ-TRACE-463: the reason the last start did not begin, reported on the entry until the next release of it. */
  readonly stalled: ReadonlyMap<ReqId, string>;
}
export interface ScheduleOutput { readonly queue: DeliveryQueue; readonly dispatch: readonly ReqId[] }

export const QUEUE_STOPPED_REASON = 'The queue is stopped: nothing new begins until it is started again, while work already dispatched continues and completes as usual.';
export const manualReason = (id: ReqId): string => `Automatic scheduling is off: ${id} waits until you release it from the queue.`;
export const heldReason = (id: ReqId): string => `${id} is held in the queue until you release it.`;
export const slotReason = (executing: number, concurrency: number): string => `Waiting for a unit slot: ${executing} of ${concurrency} in use.`;
export const stalledReason = (id: ReqId, cause: string): string => `The last start of ${id} did not begin: ${cause} Release it from the queue to try again.`;

/** The order the scheduler applies and never re-sorts for display (REQ-TRACE-478): priority, then the time the requirement entered the released column, then identifier. */
export function scheduleQueue(input: ScheduleInput): ScheduleOutput {
  const entries: QueueEntry[] = [];
  for (const r of input.executing) entries.push({ id: r.id, unit: r.unit, state: 'executing' });
  const ordered = [...input.candidates].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || (a.since < b.since ? -1 : a.since > b.since ? 1 : 0) || compareReqIds(a.id, b.id));
  let free = Math.max(0, input.settings.concurrency - input.executing.length);
  const dispatch: ReqId[] = [];
  for (const c of ordered) {
    const deferred = (reason: string) => entries.push({ id: c.id, unit: c.unit, state: 'deferred', reason });
    if (input.claimed.has(c.id)) { entries.push({ id: c.id, unit: c.unit, state: 'next' }); free -= 1; continue; }
    if (input.settings.stopped) { deferred(QUEUE_STOPPED_REASON); continue; }
    if (input.held.has(c.id)) { deferred(heldReason(c.id)); continue; }
    // Defect AP-4: before the stall, and never escaped by arming — the claim refuses an undisclosed launch, so a
    // queue that called it `next` would promise a start that silently never came, and it would hold a unit slot
    // against candidates that could have used it.
    const undisclosed = input.undisclosed.get(c.id);
    if (undisclosed !== undefined) { deferred(undisclosed); continue; }
    const stalledCause = input.stalled.get(c.id);
    if (stalledCause !== undefined && !input.armed.has(c.id)) { deferred(stalledReason(c.id, stalledCause)); continue; }
    if (!input.settings.automatic && !input.armed.has(c.id)) { deferred(manualReason(c.id)); continue; }
    if (free > 0) { entries.push({ id: c.id, unit: c.unit, state: 'next' }); dispatch.push(c.id); free -= 1; continue; }
    // Defect AP-2, found on this mechanism's first execution: the slots IN USE include the ones this same pass has
    // just handed out. Reporting the pass's starting `executing.length` told a candidate deferred behind two fresh
    // starts that "0 of 2" were in use — a number the two rows above it contradicted. The count is the concurrency
    // less the slots still free, which is the same value whenever a pass dispatches nothing.
    deferred(slotReason(input.settings.concurrency - free, input.settings.concurrency));
  }
  return { queue: { entries, automatic: input.settings.automatic, concurrency: input.settings.concurrency, stopped: input.settings.stopped }, dispatch };
}

// ---- the prompt a unit run receives (REQ-TRACE-387, 423) ----

/** The specification snapshot the run works from, with the user's send-back instructions where a run follows one (REQ-TRACE-423). */
export function runPromptFor(record: Pick<RequirementRecord, 'id' | 'title' | 'prose'>, unit: string, instructions?: string): string {
  const head = `Implement ${record.id} — ${record.title} (unit ${unit}).`;
  const body = record.prose.trim() === '' ? '(The requirement carries no prose beyond its title.)' : record.prose.trim();
  const tail = instructions !== undefined && instructions.trim() !== '' ? `\n\nInstructions from the reviewer of the previous run:\n${instructions.trim()}` : '';
  return `${head}\n\nSpecification:\n${body}${tail}\n\nWork only inside this worktree; the specification above is the snapshot this run is measured against.`;
}

// ---- the source: writability, the composer, the editor, the location (REQ-TRACE-434..444, 498) ----

export interface SourceWritability { readonly writable: boolean; readonly canCreate: boolean; readonly reason?: string }

/** REQ-TRACE-435/438/444: the store directory writable by this account and present — else the one sentence, and no editor. */
export function probeSourceWritability(root: string, storeDir: string): SourceWritability {
  const dir = resolve(root, storeDir);
  if (!existsSync(dir)) return { writable: false, canCreate: false, reason: `The requirement store ${storeDir} does not exist under ${root}; nothing can be written there.` };
  try { accessSync(dir, constants.W_OK); } catch { return { writable: false, canCreate: false, reason: `The requirement store ${storeDir} is read-only for this account; open the artifact to change it elsewhere.` }; }
  return { writable: true, canCreate: true };
}

/** REQ-TRACE-435: one sentence — the notice, the tooltip and the accessible description all use it unchanged. */
export function readOnlySentence(id: ReqId, sourcePath: string): string {
  return `${id} is read-only here: its source ${sourcePath} cannot be written by this account. Open the artifact to change it.`;
}

export function documentWritable(root: string, sourcePath: string): boolean {
  const file = resolve(root, sourcePath);
  if (!existsSync(file)) return false;
  try { accessSync(file, constants.W_OK); return true; } catch { return false; }
}

export interface DocumentDraft {
  readonly id: ReqId;
  readonly title: string;
  readonly prose: string;
  readonly kind: 'product' | 'technical';
  readonly derivedFrom: readonly ReqId[];
  readonly priority?: string;
  readonly status?: 'draft' | 'approved';
  readonly date?: string;
}

/** Spec 08 §Requirement document, composed exactly: LF, the frontmatter, the level-1 identifier heading, the prose. */
export function composeRequirementDocument(d: DocumentDraft): string {
  const lines = ['---', `req-id: ${d.id}`, `status: ${d.status ?? 'draft'}`, `title: ${quoteIfNeeded(d.title)}`];
  if (d.kind === 'technical') { lines.push('type: technical'); lines.push(`derived-from: ${d.derivedFrom.length === 1 ? d.derivedFrom[0] : `[${d.derivedFrom.join(', ')}]`}`); }
  if (d.priority !== undefined && d.priority.trim() !== '') lines.push(`priority: ${d.priority.trim()}`);
  if (d.date !== undefined) lines.push(`date: ${d.date}`);
  lines.push('---', '', `# ${d.id} - ${d.title.trim()}`, '', d.prose.trim() === '' ? '' : d.prose.trim(), '');
  return `${lines.join('\n').replace(/\n{3,}$/, '\n\n')}`;
}

function quoteIfNeeded(value: string): string {
  const v = value.trim();
  return /[:#]/.test(v) || v !== value ? JSON.stringify(v) : v;
}

/**
 * REQ-TRACE-434: the edit writes into the ORIGINAL artifact — the frontmatter's `title:` field and the level-1 heading
 * are replaced, the prose between the heading and the first second-level section is replaced, and every other line is
 * left byte for byte. A document whose shape this function does not recognise (no level-1 heading for the identifier) is
 * refused rather than guessed at.
 */
export function editRequirementDocument(text: string, id: ReqId, edit: { readonly title: string; readonly prose: string }): Result<string, string> {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const heading = lines.findIndex((l) => new RegExp(`^#\\s+${escapeRegExp(id)}\\s+-\\s`).test(l));
  if (heading === -1) return err(`${id}'s document has no level-1 heading of the form "# ${id} - <Title>"; it was not changed.`);
  let end = lines.length;
  for (let i = heading + 1; i < lines.length; i += 1) if (/^#{2,6}\s/.test(lines[i]!)) { end = i; break; }
  const out = [...lines];
  // The frontmatter title, when the document declares one (REQ-TRACE-018: the field is optional; the heading carries the title).
  if (out[0]?.trim() === '---') {
    for (let i = 1; i < out.length; i += 1) {
      if (out[i]!.trim() === '---') break;
      if (/^title\s*:/.test(out[i]!)) { out[i] = `title: ${quoteIfNeeded(edit.title)}`; break; }
    }
  }
  out[heading] = `# ${id} - ${edit.title.trim()}`;
  const prose = edit.prose.trim() === '' ? [] : edit.prose.trim().split(/\r?\n/);
  out.splice(heading + 1, end - heading - 1, '', ...prose, ...(end < lines.length ? [''] : ['']));
  return ok(out.join(nl));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * REQ-TRACE-442/444: the identifier follows the chosen source's conventions — spec 08 §Identifier format: `x00` is an
 * epic and `x01..x99` are its requirements, one hundreds-block per epic. With an epic, the next free number in its
 * block (never a tombstoned one, REQ-TRACE-124ff); without one, the next free number after the highest declared, in a
 * block no epic owns. A full block is a stated refusal, not a silent spill into the next.
 */
export function nextIdentifier(parse: Pick<StoreParse, 'records' | 'layout'>, tombstoned: ReadonlySet<number>, epic: ReqId | undefined): Result<ReqId, string> {
  const prefix = parse.layout.idPrefix;
  const taken = new Set<number>([...parse.records.map((r) => r.number), ...tombstoned]);
  if (epic !== undefined) {
    const e = parse.records.find((r) => r.id === epic);
    if (e === undefined || !e.isEpic) return err(`${epic} is not an epic of this store; a requirement is created under an epic.`);
    const block = Math.floor(e.number / 100) * 100;
    for (let n = block + 1; n < block + 100; n += 1) if (!taken.has(n)) return ok(`${prefix}-${n}`);
    return err(`The hundreds-block of ${epic} is full (${prefix}-${block + 1} to ${prefix}-${block + 99} are all declared or retired); create a new epic first.`);
  }
  // Without an epic: after the highest declared number, in a block no epic owns (an `x00` is an epic's own number and is skipped).
  const epicBlocks = new Set(parse.records.filter((r) => r.isEpic).map((r) => Math.floor(r.number / 100) * 100));
  const highest = Math.max(0, ...taken);
  let n = highest + 1;
  while (taken.has(n) || n % 100 === 0 || epicBlocks.has(Math.floor(n / 100) * 100)) n += 1;
  return ok(`${prefix}-${n}`);
}

/**
 * REQ-TRACE-443: the previewed location IS the location the write produces — one function answers both. The store's
 * convention, read from the fixture and from spec 08 §Store layout: an epic's children live in a directory named for
 * the epic document, `<storeDir>/<epic basename>/<ID>-<slug>.md`; a requirement under no epic sits in the store root.
 */
export function createLocation(parse: Pick<StoreParse, 'records' | 'layout'>, id: ReqId, title: string, epic: ReqId | undefined): Result<string, string> {
  const file = `${id}-${slugOf(title)}.md`;
  if (epic === undefined) return ok(posix.join(parse.layout.storeDir, file));
  const e = parse.records.find((r) => r.id === epic);
  if (e === undefined || !e.isEpic) return err(`${epic} is not an epic of this store, so no location can be derived for a requirement under it.`);
  const dir = posix.join(posix.dirname(e.sourcePath), posix.basename(e.sourcePath).replace(/\.md$/i, ''));
  return ok(posix.join(dir, file));
}

export interface SourceWriteDeps { readonly clocks: Clocks }

/** ADR-0004's atomic replace with REQ-TRACE-061's ladder, LF, UTF-8 (REQ-TRACE-495); the parent created for a new epic directory. */
export async function writeSourceDocument(root: string, relativePath: string, content: string, deps: SourceWriteDeps): Promise<Result<{ readonly path: string }, string>> {
  const target = resolve(root, relativePath);
  const r = await replaceDocument(target, content, { createParent: true, timers: deps.clocks.timers, ladder: { delays: [millis(50), millis(100), millis(200), millis(400)] } });
  if (!r.ok) return err(`${relativePath} could not be written: ${r.error.detail ?? r.error.headline}`);
  return ok({ path: target });
}

/** The epic's index table gains a row for a created child when the document carries one (best-effort; REQ-TRACE-020's table is a convenience, not the source of the relation). */
export function appendEpicIndexRow(epicText: string, child: { readonly id: ReqId; readonly title: string; readonly priority: string | undefined; readonly lifecycle: string; readonly relativeLink: string }): string | null {
  const nl = epicText.includes('\r\n') ? '\r\n' : '\n';
  const lines = epicText.split(/\r?\n/);
  let last = -1;
  for (let i = 0; i < lines.length; i += 1) if (/^\|\s*\[?[A-Z][A-Z0-9]*-\d+/.test(lines[i]!)) last = i;
  if (last === -1) return null;
  lines.splice(last + 1, 0, `| [${child.id}](${child.relativeLink}) | ${child.title} | ${child.priority ?? '—'} | ${child.lifecycle} |`);
  return lines.join(nl);
}

export function readSourceText(root: string, relativePath: string): string | null {
  try { return readFileSync(resolve(root, relativePath), 'utf8'); } catch { return null; }
}

export function epicIndexLink(epicSourcePath: string, childSourcePath: string): string {
  return posix.relative(posix.dirname(epicSourcePath), childSourcePath);
}

