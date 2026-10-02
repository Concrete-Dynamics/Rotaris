#!/usr/bin/env node
// The orchestrated-build skill's tool: turns a plan into a runnable workflow script, recovers a stopped run from
// its journals, reports where every bundle stands, and dry-runs a script with stubbed agents before it spends any.
//
//   node orchestration.mjs render   --plan P.json --profile F.json --out run.js [--runs RUNS.txt] [--journal-root DIR] [--repo DIR]
//   node orchestration.mjs status   --runs RUNS.txt [--journal-root DIR]
//   node orchestration.mjs dry-run  run.js [--fail-verify key=N ...] [--findings N] [--block key ...]
//   node orchestration.mjs self-test
//
// RUNS.txt lists the run ids of one orchestration in launch order, one per line ('#' starts a comment). `render`
// with --runs reads every journal named there and resumes each bundle where it stopped; without it, it renders a
// fresh run. Exit codes: 0 ok, 1 a check failed, 2 bad usage.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SKILL = path.dirname(HERE)
const TEMPLATE = path.join(HERE, 'workflow.template.js')
const ARGS_MARKER = '/*@@ARGS@@*/ null'
const KEY_RE = /^[a-z0-9][a-z0-9+-]*$/i
const REPAIR_KEY_RE = /^accept(\d+)-\d+$/
const PLAN_ID_RE = /^[a-z0-9]{1,8}$/
const DEFAULT_MAX_FIX_ROUNDS = 3
const BUDGETS_BEFORE_OWNER = 2

class UsageError extends Error {}

// ------------------------------------------------------------------------------------------------ journals
function defaultJournalRoot() { return path.join(os.homedir(), '.claude', 'projects') }
function safeList(dir) { try { return fs.readdirSync(dir) } catch { return [] } }

/** A run's journal lives at <root>/<project>/<session>/subagents/workflows/<runId>/journal.jsonl. */
export function findJournal(runId, root = defaultJournalRoot()) {
  const direct = path.join(root, runId, 'journal.jsonl')
  if (fs.existsSync(direct)) return direct
  for (const project of safeList(root)) {
    for (const session of safeList(path.join(root, project))) {
      const p = path.join(root, project, session, 'subagents', 'workflows', runId, 'journal.jsonl')
      if (fs.existsSync(p)) return p
    }
  }
  throw new Error('no journal found for run ' + runId + ' under ' + root)
}

/** The run ids of one orchestration. A runs file that is missing or names no run is an error, never a fresh start. */
export function readRuns(runsFile) {
  if (!fs.existsSync(runsFile)) throw new UsageError('runs file ' + runsFile + ' does not exist (omit --runs for a fresh render)')
  const ids = fs.readFileSync(runsFile, 'utf8').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean)
  if (ids.length === 0) throw new UsageError('runs file ' + runsFile + ' names no run (omit --runs for a fresh render)')
  return ids
}

/** Every agent call of every run, in order: { run, stage, key, label, result|null }. */
export function readEvents(runIds, root) {
  const events = []
  for (const run of runIds) {
    const labels = {}, results = {}, order = []
    for (const line of fs.readFileSync(findJournal(run, root), 'utf8').split('\n')) {
      if (!line.trim()) continue
      const e = JSON.parse(line)
      if (e.type === 'started') { labels[e.key] = e.label; order.push(e.key) } else if (e.type === 'result') results[e.key] = e.result
    }
    for (const k of order) {
      const label = labels[k]
      const colon = label.indexOf(':')
      const stage = label.slice(0, colon)
      const key = label.slice(colon + 1).split('#')[0].replace(' (resumed)', '')
      events.push({ run, stage, key, label, result: results[k] ?? null })
    }
  }
  return events
}

// ------------------------------------------------------------------------------------------------ where each bundle stands
const MOVED_ON = (main) => 'If `git log HEAD..origin/' + main + '` is not empty (other bundles merged since this branch last took origin/' + main + '), first `git fetch origin ' + main + ' && git merge origin/' + main + '` into the branch, resolving conflicts as repository.md (Merge conflicts) says, and commit the merge with the trailers. '
const INTERRUPTED = (who) => 'An earlier ' + who + ' of this bundle was stopped by a restart and may have committed part of its work or left an uncommitted edit. Read `git log` and `git status` first, decide what it already did and whether it is sound (keep an uncommitted edit only if it is right), then finish the rest. '
const VERIFIER_INTERRUPTED = 'An earlier verifier of this bundle was stopped by a restart, possibly in the middle of reverting a hunk to watch a test fail. The builder reports its work as committed, so anything `git status` shows uncommitted in the worktree is that verifier\'s probe: save it (`git diff > <scratchpad>/interrupted-probe.diff`), restore with `git checkout -- .` and `git clean -fd` for files the probe created (never a file a commit added), and say so in your evidence. '
const STUBBORN = 'This bundle already spent a full repair budget and these findings survived it: find the ROOT cause of each (a finding that recurs in a new shape means an earlier repair treated a symptom), and prove each repair with a test that fails without it. '

/**
 * Where each bundle stands across all runs of one orchestration:
 * `seed` (settled: merged, blocked, or needs-owner), `resume` (the stage to pick up at, with what the agent needs),
 * and `cache` (finished acceptance agents still valid for replay).
 */
export function deriveState(events, { mainBranch = 'main', maxFixRounds = DEFAULT_MAX_FIX_ROUNDS, reopen = {}, freshAcceptance = false } = {}) {
  const byKey = {}
  const cache = {}
  events.forEach((e, i) => {
    if (e.stage === 'accept') {
      // A finished acceptance agent is replayed only while nothing but repair bundles merged after it.
      const planMergeAfter = events.slice(i + 1).some((x) => x.stage === 'merge' && x.result && x.result.merged && x.result.pushed && !REPAIR_KEY_RE.test(x.key))
      if (e.result && !freshAcceptance && !planMergeAfter) cache[e.label] = e.result
      return
    }
    ;(byKey[e.key] ??= []).push(e)
  })
  const seed = {}, resume = {}
  for (const [key, evs] of Object.entries(byKey)) {
    const done = evs.filter((e) => e.result)
    const merge = done.filter((e) => e.stage === 'merge').pop()
    const report = done.filter((e) => e.stage === 'implement' || e.stage === 'fix').pop()?.result
    if (merge && merge.result.merged && merge.result.pushed) {
      seed[key] = { key, status: 'merged', mainCommit: merge.result.mainCommit, notesMoved: report?.notesMoved, notesRecorded: report?.notesRecorded, questionsRaised: report?.questionsRaised }
      continue
    }
    const last = evs[evs.length - 1]
    const verdicts = done.filter((e) => e.stage === 'verify').map((e) => e.result)
    const verdict = verdicts[verdicts.length - 1]
    const failedVerdict = verdicts.filter((v) => !v.pass).pop()
    const fixes = done.filter((e) => e.stage === 'fix').length
    if (last.result && last.result.blocked) {
      if (reopen[key]) resume[key] = { stage: 'verify', impl: last.result, roundBase: fixes, note: 'This bundle stopped as blocked. The orchestrator reopens it with this scope: ' + reopen[key] }
      else seed[key] = { key, status: 'blocked', blockedReason: last.result.blockedReason }
      continue
    }
    const stubborn = fixes >= maxFixRounds
    let r
    if (last.stage === 'implement' && !last.result) {
      r = { stage: 'implement', existing: INTERRUPTED('builder') + MOVED_ON(mainBranch) }
    } else if (last.stage === 'fix' && !last.result) {
      r = { stage: 'fix', impl: report, verdict: failedVerdict, roundBase: fixes, note: INTERRUPTED('repairer') + (stubborn ? STUBBORN : '') + MOVED_ON(mainBranch) }
    } else if (last.stage === 'verify' && !last.result) {
      const lastFix = done.filter((e) => e.stage === 'fix').pop()
      const failedAt = evs.findIndex((e) => e.result === failedVerdict)
      const answered = failedVerdict && lastFix && failedAt < evs.indexOf(lastFix)
      r = { stage: 'verify', impl: report, roundBase: fixes, previous: answered ? failedVerdict : undefined, note: VERIFIER_INTERRUPTED }
    } else if (last.stage === 'verify' && !last.result.pass) {
      if (fixes >= maxFixRounds * BUDGETS_BEFORE_OWNER) { seed[key] = { key, status: 'needs-owner', lastBlocking: last.result.blocking, reason: BUDGETS_BEFORE_OWNER + ' repair budgets spent; the owner decides' }; continue }
      r = { stage: 'fix', impl: report, verdict: last.result, roundBase: fixes, note: (stubborn ? STUBBORN : '') + MOVED_ON(mainBranch) }
    } else if (last.stage === 'verify') {
      r = { stage: 'merge', impl: report, verdict: last.result }
    } else if (last.stage === 'merge' && last.result && !last.result.merged) {
      // The merge gate refused it: that is a finding for the repairer, like a verifier's.
      r = { stage: 'fix', impl: report, verdict: { pass: false, blocking: [{ title: 'The gate is red once origin/' + mainBranch + ' is merged in', detail: last.result.problem || last.result.checkOnMain }], optional: [] }, roundBase: fixes, note: MOVED_ON(mainBranch) }
    } else if (last.stage === 'merge') {
      r = { stage: 'merge', impl: report, verdict }
    } else {
      // A builder's or repairer's report with no verification after it.
      r = { stage: 'verify', impl: report, roundBase: fixes, previous: last.stage === 'fix' ? failedVerdict : undefined }
    }
    if (stubborn && r.stage === 'fix') r.efforts = { fix: 'max' }
    if (r.stage !== 'implement' && !r.impl) throw new Error('bundle ' + key + ' has no report to resume from')
    if (r.stage === 'fix' && !r.verdict) throw new Error('bundle ' + key + ' has no verdict to repair')
    resume[key] = r
  }
  return { seed, resume, cache }
}

// ------------------------------------------------------------------------------------------------ lanes
/**
 * Lane order: each lane sorted by its own dependencies (stable in plan order); resumed bundles first; a bundle that
 * waits on an unsettled bundle of another lane, and every bundle of its lane that depends on it, last (so the lane
 * keeps working meanwhile). Then lanes are balanced by moving a bundle nothing waits on and that waits on nothing,
 * never a pinned one. A pinned set must already sit in one lane: it runs one bundle after another there.
 */
export function orderLanes(lanes, bundles, { seed = {}, resume = {}, pins = [] } = {}) {
  const laneOf = {}
  lanes.forEach((keys, i) => keys.forEach((k) => { laneOf[k] = i }))
  for (const set of pins) {
    if (set.some((k) => laneOf[k] === undefined)) throw new UsageError('pinned set names an unknown bundle: ' + set.join(', '))
    if (new Set(set.map((k) => laneOf[k])).size > 1) throw new UsageError('pinned set spans lanes (put its bundles in one lane): ' + set.join(', '))
  }
  const pinned = new Set(pins.flat())
  const dependents = {}
  for (const [k, b] of Object.entries(bundles)) for (const d of b.after || []) (dependents[d] ??= []).push(k)
  const out = lanes.map((keys, i) => {
    const live = keys.filter((k) => !seed[k])
    const inLane = new Set(live)
    const sorted = []
    const placed = new Set()
    const place = (k, trail) => {
      if (placed.has(k)) return
      if (trail.includes(k)) throw new UsageError('bundles wait on each other in a cycle: ' + [...trail, k].join(' -> '))
      for (const d of bundles[k].after || []) if (inLane.has(d)) place(d, [...trail, k])
      placed.add(k); sorted.push(k)
    }
    for (const k of live) place(k, [])
    const waiter = new Set()
    for (const k of sorted) if ((bundles[k].after || []).some((d) => (laneOf[d] !== i && !seed[d]) || waiter.has(d))) waiter.add(k)
    const first = sorted.filter((k) => resume[k])
    const rest = sorted.filter((k) => !resume[k])
    return [...first, ...rest.filter((k) => !waiter.has(k)), ...rest.filter((k) => waiter.has(k))]
  })
  const movable = (k) => (bundles[k].after || []).length === 0 && !(dependents[k] || []).length && !resume[k] && !pinned.has(k)
  while (out.length >= 2) {
    const sizes = out.map((l) => l.length)
    const long = sizes.indexOf(Math.max(...sizes)), short = sizes.indexOf(Math.min(...sizes))
    if (sizes[long] - sizes[short] <= 1) break
    const i = out[long].map(movable).lastIndexOf(true)
    if (i < 0) break
    const [k] = out[long].splice(i, 1)
    const firstWaiter = out[short].findIndex((x) => (bundles[x].after || []).some((d) => !seed[d] && !out[short].includes(d)))
    out[short].splice(firstWaiter < 0 ? out[short].length : firstWaiter, 0, k)
  }
  return out.filter((l) => l.length > 0)
}

// ------------------------------------------------------------------------------------------------ plan → arguments
function slug(key) { return key.replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase() }

/** The PATH export a shell needs for Node >= 24, or the no-op ':' when the default node already is. */
export function node24Prefix() {
  const major = Number(process.versions.node.split('.')[0])
  if (major >= 24 && !process.execPath.startsWith('/opt/node24/')) return ':'
  return fs.existsSync('/opt/node24/bin/node') ? 'export PATH=/opt/node24/bin:$PATH' : ':'
}

/** Resolves the profile's tokens ({repo}, {id}, {node24}) and lays the plan's session values over it. */
export function resolveProfile(profile, plan, repo) {
  const sub = (v) => (typeof v === 'string' ? v.replaceAll('{repo}', repo).replaceAll('{id}', plan.id || 'noid').replaceAll('{node24}', node24Prefix()) : v)
  const run = Object.fromEntries(Object.entries(profile.run).map(([k, v]) => [k, sub(v)]))
  if (!plan.trailers) throw new UsageError('the plan names no commit trailers (copy them from this session\'s attribution instructions)')
  run.trailers = plan.trailers
  run.pushTargets = [run.mainBranch, ...(plan.extraPushTargets || [])]
  if (plan.model) run.model = plan.model
  // A live run renders only with the owner's authorization, quoted, in the plan.
  const live = plan.live
  const words = live && typeof live.ownerWords === 'string' ? live.ownerWords.trim() : ''
  if (live && live.authorized === true && /^<[^>]*>$/.test(words)) throw new UsageError('plan.live.ownerWords is still the placeholder: quote the owner\'s words, or drop `live`')
  if (live && live.authorized === true && words && run.live) run.live = { ...run.live, ownerWords: words }
  else delete run.live
  return { ...profile, run }
}

// `<repo>-wt-skillref-<id>` and `<repo>-wt-integ-<id>` would read as bundle worktrees of a plan with these ids.
const RESERVED_IDS = ['skillref', 'integ']

export function buildArgs(plan, profile, state = { seed: {}, resume: {}, cache: {} }) {
  if (!PLAN_ID_RE.test(plan.id || '')) throw new UsageError('the plan needs an `id` of 1-8 lower-case letters or digits; it prefixes every branch and worktree, so pick one no earlier orchestration used')
  if (RESERVED_IDS.includes(plan.id)) throw new UsageError('plan id ' + plan.id + ' is reserved: it names the reference and integration worktrees')
  const bundles = {}
  const laneKeys = {}
  const branches = new Set()
  const bases = {}
  for (const b of plan.bundles || []) if (b.key && !b.short) (bases[plan.id + '-' + slug(b.key)] ??= []).push(b.key)
  for (const b of plan.bundles || []) {
    if (!KEY_RE.test(b.key || '')) throw new UsageError('bundle key ' + JSON.stringify(b.key) + ' must match ' + KEY_RE)
    if (REPAIR_KEY_RE.test(b.key)) throw new UsageError('bundle key ' + b.key + ' is reserved for acceptance repairs')
    if (bundles[b.key]) throw new UsageError('duplicate bundle key ' + b.key)
    if (!Array.isArray(b.tasks) || b.tasks.length === 0) throw new UsageError('bundle ' + b.key + ' has no tasks')
    // A worktree name depends on the key alone, so a later render that adds a bundle never renames a resumed one.
    const base = plan.id + '-' + slug(b.key)
    const short = b.short || (bases[base].length > 1 ? base + '-' + createHash('sha1').update(b.key).digest('hex').slice(0, 4) : base)
    const branch = b.branch || plan.id + '-' + b.key
    if (branches.has(branch)) throw new UsageError('two bundles share branch ' + branch)
    branches.add(branch)
    // A reopened bundle's scope travels in its notes, so every repairer and verifier of it sees it.
    const notes = [b.notes, b.reopen ? 'Reopened by the orchestrator with this scope (it binds every stage): ' + b.reopen : ''].filter(Boolean).join('\n')
    bundles[b.key] = { title: b.title || b.tasks.map((t) => t.title).join('; and '), branch, short, tasks: b.tasks, after: b.after || [], notes, effort: b.effort || 'high', efforts: b.efforts }
    ;(laneKeys[b.lane || 'A'] ??= []).push(b.key)
  }
  for (const [k, b] of Object.entries(bundles)) for (const d of b.after) if (!bundles[d]) throw new UsageError('bundle ' + k + ' waits on unknown bundle ' + d)
  const seen = new Set(), stack = new Set()
  const visit = (k, trail) => {
    if (seen.has(k)) return
    if (stack.has(k)) throw new UsageError('bundles wait on each other in a cycle: ' + [...trail, k].join(' -> '))
    stack.add(k); for (const d of bundles[k].after) visit(d, [...trail, k]); stack.delete(k); seen.add(k)
  }
  for (const k of Object.keys(bundles)) visit(k, [])
  const shortsSeen = new Set()
  for (const b of Object.values(bundles)) { if (shortsSeen.has(b.short)) throw new UsageError('two bundles share worktree name ' + b.short); shortsSeen.add(b.short) }
  // Acceptance judged a main that a plan bundle still to land will change: none of its results may be replayed.
  const pending = Object.keys(bundles).filter((k) => !state.seed[k])
  const cache = pending.length ? {} : state.cache
  const rounds = plan.acceptance?.rounds ?? 2
  for (const k of Object.keys(state.resume)) {
    if (bundles[k]) continue
    const m = REPAIR_KEY_RE.exec(k)
    if (!m) throw new UsageError('the journals resume bundle ' + k + ', which the plan no longer has; restore it to the plan or start a new orchestration')
    if (!cache['accept:autopsy#' + m[1]]) throw new UsageError('the journals resume repair bundle ' + k + ' but acceptance round ' + m[1] + ' is no longer replayable (' + (pending.length ? 'plan bundles still have to land: ' + pending.join(', ') : 'something merged after it') + '); start a new RUNS.txt to re-accept')
    if (Number(m[1]) >= rounds) throw new UsageError('the journals resume repair bundle ' + k + ' of round ' + m[1] + ', but acceptance.rounds (' + rounds + ') no longer repairs that round')
  }
  const lanes = orderLanes(Object.keys(laneKeys).sort().map((l) => laneKeys[l]), bundles, { seed: state.seed, resume: state.resume, pins: plan.pins || [] })
  return {
    run: { ...profile.run, planId: plan.id, brief: plan.brief || '' },
    bundles, lanes, seed: state.seed, resume: state.resume,
    acceptance: { rounds, cache },
  }
}

/** Agents read the skill's references from `skillDir`: they must exist there and match the copy that renders. */
export function checkSkillDir(skillDir, own = SKILL) {
  if (path.resolve(skillDir) === path.resolve(own)) return
  const stale = []
  for (const f of ['SKILL.md', ...safeList(path.join(own, 'references')).map((x) => path.join('references', x))]) {
    const theirs = path.join(skillDir, f)
    if (!fs.existsSync(theirs) || fs.readFileSync(theirs, 'utf8') !== fs.readFileSync(path.join(own, f), 'utf8')) stale.push(f)
  }
  if (stale.length) throw new UsageError('agents would read a missing or stale skill at ' + skillDir + ' (' + stale.join(', ') + '): refresh the reference worktree to origin/main (SKILL.md §3) and render with its copy of this tool')
}

/** A fresh orchestration's id must be new: an old one's unmerged branches and worktrees would be picked up. */
export function checkPlanIdFresh(repo, id) {
  const branches = execFileSync('git', ['-C', repo, 'branch', '--list', id + '-*'], { encoding: 'utf8' }).trim()
  const worktrees = safeList(path.dirname(repo)).filter((d) => d.startsWith(path.basename(repo) + '-wt-' + id + '-'))
  if (branches || worktrees.length) throw new UsageError('plan id ' + id + ' was used before (' + [...branches.split('\n').map((x) => x.trim()).filter(Boolean), ...worktrees].slice(0, 5).join(', ') + '): pick another id for a fresh orchestration')
}

export function render(args) {
  const template = fs.readFileSync(TEMPLATE, 'utf8')
  if (!template.includes(ARGS_MARKER)) throw new Error('template lost its args marker')
  // A function replacement: a plan's text may hold `$&`, `$$` or `$'`, which a string replacement would rewrite.
  return template.replace(ARGS_MARKER, () => JSON.stringify(args))
}

function compile(script) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  return new AsyncFunction('agent', 'parallel', 'log', 'phase', 'args', script.replace('export const meta', 'const meta'))
}

// ------------------------------------------------------------------------------------------------ dry run
/**
 * Runs a rendered script against stub agents. `failVerify[key]` verifications of a bundle fail; `mergeRefuse[key]`
 * merges are refused; `block` keys report blocked; `lose` labels (or every label, with `loseAll`) come back empty.
 */
export async function dryRun(script, { failVerify = {}, mergeRefuse = {}, mergeUnpushed = [], findings = [], block = [], lose = [], loseAll = false, quiet = true } = {}) {
  const calls = [], prompts = {}, logs = []
  let active = 0, peak = 0, activeMerges = 0, peakMerges = 0
  const counts = {}
  const agent = async (prompt, o) => {
    active++; peak = Math.max(peak, active)
    const [stage, rest] = [o.label.slice(0, o.label.indexOf(':')), o.label.slice(o.label.indexOf(':') + 1)]
    if (stage === 'merge') { activeMerges++; peakMerges = Math.max(peakMerges, activeMerges) }
    calls.push(o.label + ' [' + o.effort + ']'); prompts[o.label] = prompt
    await new Promise((r) => setTimeout(r, 2))
    active--; if (stage === 'merge') activeMerges--
    if (loseAll || lose.includes(o.label)) return null
    const key = rest.split('#')[0].replace(' (resumed)', '')
    const n = (counts[stage + key] = (counts[stage + key] || 0) + 1)
    if (stage === 'implement' || stage === 'fix') return { worktree: '/wt/' + key, branch: key, commits: ['c'], summary: 's', verified: 'v', notVerified: '', blocked: block.includes(key), blockedReason: block.includes(key) ? 'stub' : undefined }
    if (stage === 'verify') { const fail = n <= (failVerify[key] || 0); return { pass: !fail, blocking: fail ? [{ title: 'stub finding ' + n, detail: 'd' }] : [], evidence: 'e', optional: ['opt'] } }
    if (stage === 'merge') {
      if (n <= (mergeRefuse[key] || 0)) return { merged: false, pushed: false, checkOnMain: 'red', problem: 'merged gate red' }
      if (mergeUnpushed.includes(key)) return { merged: true, pushed: false, checkOnMain: 'green', problem: 'push rejected' }
      return { merged: true, pushed: true, mainCommit: 'm-' + key, checkOnMain: 'green' }
    }
    if (rest.startsWith('sweep')) return { head: 'h', gate: 'green', results: [{ proof: 'p', status: 'pass', summary: '', evidence: '' }] }
    if (rest.startsWith('live')) return { head: 'h', runs: [] }
    if (rest.startsWith('autopsy')) return { report: 'r', findings: findings.map((f, i) => ({ id: 'F' + i, kind: 'product-defect', severity: 'degrades', title: 't' + i, detail: 'd', evidence: 'e', files: 'f', ...f })) }
    throw new Error('unexpected agent label ' + o.label)
  }
  const parallel = async (fns) => Promise.all(fns.map((f) => f()))
  const log = (m) => { logs.push(m); if (!quiet) console.log('LOG', m) }
  let timer
  const stalled = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('the dry run never finished: a bundle waits on one that never settles (last calls: ' + calls.slice(-3).join(', ') + ')')), 15000) })
  try { return { result: await Promise.race([compile(script)(agent, parallel, log, () => {}, undefined), stalled]), calls, prompts, logs, peak, peakMerges } } finally { clearTimeout(timer) }
}

// ------------------------------------------------------------------------------------------------ status
export function status(runIds, root) {
  const { seed, resume, cache } = deriveState(readEvents(runIds, root))
  const rows = []
  for (const [k, s] of Object.entries(seed)) rows.push([k, s.status, s.mainCommit || s.blockedReason || s.reason || ''])
  for (const [k, r] of Object.entries(resume)) rows.push([k, 'next: ' + r.stage, r.verdict && !r.verdict.pass ? r.verdict.blocking.length + ' blocking' : ''])
  return { rows: rows.sort((a, b) => a[0].localeCompare(b[0])), acceptance: Object.keys(cache) }
}

// ------------------------------------------------------------------------------------------------ self-test
const settledStatus = (run, key) => run.result.bundles.find((b) => b.key === key)?.status

/** Every behaviour the skill relies on, each pinned by an assertion that fails when the behaviour breaks. */
export async function selfTest({ quiet = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-'))
  try {
    const rawProfile = JSON.parse(fs.readFileSync(path.join(SKILL, 'profiles', 'rotaris-crw.json'), 'utf8'))
    const session = { id: 'st', trailers: 'Co-Authored-By: A <a@example.com>\nSession: S', extraPushTargets: ['session-branch'] }
    const profile = resolveProfile(rawProfile, session, '/srv/repo')
    const liveProfile = resolveProfile(rawProfile, { ...session, live: { authorized: true, ownerWords: 'run it as much as you want' } }, '/srv/repo')
    assert.equal(profile.run.integ, '/srv/repo-wt-integ-st', 'the {repo} and {id} tokens resolve')
    assert.notEqual(resolveProfile(rawProfile, { ...session, id: 'st2' }, '/srv/repo').run.integ, profile.run.integ, 'two plans merge in two integration worktrees, so they can run at once')
    assert.equal(profile.run.skillDir, '/srv/repo-wt-skillref-st/.agents/skills/orchestrated-build', 'agents read this orchestration\'s own reference worktree, never the owner\'s checkout')
    assert.deepEqual(profile.run.pushTargets, ['main', 'session-branch'])
    assert.equal(profile.run.live, undefined, 'no live run renders without the owner\'s quoted authorization')
    assert.equal(liveProfile.run.live.ownerWords, 'run it as much as you want')
    assert.throws(() => resolveProfile(rawProfile, {}, '/srv/repo'), /trailers/, 'a plan without trailers is refused')
    assert.throws(() => resolveProfile(rawProfile, { ...session, live: { authorized: true, ownerWords: '<the owner\'s authorization, quoted>' } }, '/srv/repo'), /placeholder/, 'a placeholder never authorizes a live run')
    const task = (t, body = 'do ' + t) => ({ title: t, body })
    const plan = {
      id: 'st', brief: 'b', pins: [['p1', 'p2']],
      bundles: [
        { key: 'a1', lane: 'A', tasks: [task('x'), task('y', 'keep $& and $$ and $\' verbatim')] },
        { key: 'a3', lane: 'A', after: ['b2'], tasks: [task('x')] },
        { key: 'a4', lane: 'A', after: ['a3'], tasks: [task('x')] },
        { key: 'a2', lane: 'A', after: ['a1'], tasks: [task('x')] },
        { key: 'b1', lane: 'B', tasks: [task('x')] },
        { key: 'b2', lane: 'B', after: ['b1'], tasks: [task('x')] },
        { key: 'b3', lane: 'B', tasks: [task('x')] },
        { key: 'b4', lane: 'B', tasks: [task('x')] },
        { key: 'p1', lane: 'B', tasks: [task('x')] },
        { key: 'p2', lane: 'B', tasks: [task('x')] },
      ],
      acceptance: { rounds: 2 },
    }

    // Plan validation and lane order.
    let args = buildArgs(plan, profile)
    assert.deepEqual(args.lanes[0].slice(-2), ['a3', 'a4'], 'a cross-lane waiter goes last with the bundles of its lane that wait on it')
    assert.ok(args.lanes.some((l) => l.includes('p1') && l.includes('p2')), 'a pinned set stays in one lane')
    assert.ok(Math.abs(args.lanes[0].length - args.lanes[1].length) <= 1, 'lanes are balanced')
    assert.deepEqual(buildArgs({ id: 'st', bundles: [{ key: 'd', after: ['k'], tasks: [task('x')] }, { key: 'k', tasks: [task('x')] }] }, profile).lanes, [['k', 'd']], 'a lane is sorted by its dependencies')
    assert.throws(() => buildArgs({ id: 'st', bundles: [{ key: 'x', after: ['y'], tasks: [task('t')] }, { key: 'y', after: ['x'], tasks: [task('t')] }] }, profile), /cycle/)
    assert.throws(() => buildArgs({ ...plan, pins: [['a1', 'b1']] }, profile), /spans lanes/)
    assert.throws(() => buildArgs({ id: 'st', bundles: [{ key: 'a#b', tasks: [task('t')] }] }, profile), /must match/)
    assert.throws(() => buildArgs({ id: 'st', bundles: [{ key: 'accept1-2', tasks: [task('t')] }] }, profile), /reserved/)
    assert.throws(() => buildArgs({ bundles: [] }, profile), /id/)
    assert.throws(() => buildArgs({ id: 'skillref', bundles: [] }, profile), /reserved/, 'the reference worktrees\' name is no plan id')
    assert.throws(() => buildArgs({ id: 'integ', bundles: [] }, profile), /reserved/, 'the integration worktrees\' name is no plan id')
    const twins = buildArgs({ id: 'st', bundles: [{ key: 'record-hygiene', tasks: [task('t')] }, { key: 'record-hygiene+configdir', tasks: [task('t')] }] }, profile)
    assert.notEqual(twins.bundles['record-hygiene'].short, twins.bundles['record-hygiene+configdir'].short, 'two keys never share a worktree')
    const reordered = buildArgs({ id: 'st', bundles: [{ key: 'record-hygiene+configdir', tasks: [task('t')] }, { key: 'record-hygiene', tasks: [task('t')] }] }, profile)
    assert.equal(reordered.bundles['record-hygiene'].short, twins.bundles['record-hygiene'].short, 'a worktree name depends on its key alone')
    assert.equal(twins.bundles['record-hygiene'].branch, 'st-record-hygiene', 'branches carry the plan id')
    assert.deepEqual(buildArgs({ id: 'st', bundles: [] }, profile).lanes, [], 'an acceptance-only plan renders')
    assert.throws(() => readRuns(path.join(tmp, 'missing.txt')), /does not exist/)
    fs.writeFileSync(path.join(tmp, 'empty.txt'), '# nothing\n')
    assert.throws(() => readRuns(path.join(tmp, 'empty.txt')), /names no run/)

    // A fresh run: dependencies, serialized merges, repair loop, merge refusal, acceptance and its repairs.
    const script = render(args)
    assert.ok(script.includes(JSON.stringify('keep $& and $$ and $\' verbatim').slice(1, -1)), 'plan text survives rendering verbatim')
    let run = await dryRun(script, { failVerify: { a1: 2 }, mergeRefuse: { b3: 1 }, findings: [{ area: 'pkg/a/x.ts' }, { area: 'pkg/a/y.ts' }, { area: 'other/z.ts' }] })
    assert.equal(run.result.status, 'complete')
    for (const k of Object.keys(args.bundles)) assert.equal(settledStatus(run, k), 'merged', k + ' merges')
    assert.ok(run.calls.indexOf('implement:b2 [high]') > run.calls.indexOf('merge:b1 [high]'), 'a dependent starts only after its dependency merged')
    assert.ok(run.calls.indexOf('implement:a3 [high]') > run.calls.indexOf('merge:b2 [high]'), 'a cross-lane dependent waits too')
    assert.equal(run.peakMerges, 1, 'merges are serialized')
    assert.ok(run.calls.includes('fix:a1#2 [high]') && run.calls.includes('verify:a1#3 [high]'), 'a failing bundle is repaired and re-verified')
    assert.match(run.prompts['verify:a1#2'], /previous round's BLOCKING findings[\s\S]*stub finding 1/, 'a verifier sees the findings the repair answered')
    assert.match(run.prompts['verify:a1#1'], /Co-Authored-By: A/, 'the verifier sees the trailers it checks')
    assert.match(run.prompts['merge:a1'], /Co-Authored-By: A/, 'the merge agent sees the trailers it writes')
    assert.ok(run.calls.includes('fix:b3#1 [high]'), 'a merge refused on a red gate goes back to repair')
    assert.match(run.prompts['merge:b3'], /Red: do not push; report `merged: false`/, 'the merge agent is told how to report a red merged result')
    const unpushed = await dryRun(script, { mergeUnpushed: ['b3'] })
    assert.equal(settledStatus(unpushed, 'b3'), 'merge-failed', 'a merge whose push failed ends merge-failed, never sent to repair')
    assert.ok(!unpushed.calls.includes('fix:b3#1 [high]'))
    assert.match(run.prompts['implement:a1'], /Live runs are NOT authorised/, 'without authorization agents are told not to launch live runs')
    assert.match(run.prompts['implement:a1'], /Bash tool's own `timeout` parameter/, 'agents give a long background job an explicit timeout')
    assert.ok(!run.calls.some((c) => c.startsWith('accept:live')), 'no live-runner without authorization')
    assert.equal(run.result.acceptance.length, 2)
    assert.ok(run.calls.includes('implement:accept1-1 [high]') && run.calls.includes('implement:accept1-2 [high]') && !run.calls.includes('implement:accept1-3 [high]'), 'findings that share a directory pair; the rest stand alone')
    assert.match(run.prompts['implement:accept1-1'], /st-accept1-1/, 'repair branches carry the plan id')
    const liveRun = await dryRun(render(buildArgs(plan, liveProfile)), {})
    assert.ok(liveRun.calls.some((c) => c.startsWith('accept:live#1')), 'with authorization the live-runner runs')
    assert.match(liveRun.prompts['implement:a1'], /AUTHORISED[\s\S]*as much as you want/)
    run = await dryRun(render(buildArgs({ id: 'st', bundles: [], acceptance: { rounds: 2 } }, profile)), { findings: Array.from({ length: 12 }, (_, i) => ({ area: 'd' + i + '/f.ts' })) })
    assert.ok(run.peak <= profile.run.repairPool, 'the repair pool bounds concurrency (peak ' + run.peak + ')')

    // Endings: a spent budget, a blocked bundle, a halt, a lost autopsy.
    run = await dryRun(script, { failVerify: { b3: 9 } })
    assert.equal(settledStatus(run, 'b3'), 'unverified')
    assert.equal(run.result.status, 'incomplete', 'acceptance is skipped while a plan bundle is unsettled')
    assert.ok(!run.calls.some((c) => c.startsWith('accept:')))
    run = await dryRun(script, { block: ['b1'] })
    assert.equal(settledStatus(run, 'b1'), 'blocked')
    assert.match(run.prompts['implement:b2'], /did NOT land[\s\S]*b1 ended blocked/, 'a dependent is told its dependency did not land')
    run = await dryRun(script, { loseAll: true })
    assert.equal(run.result.status, 'halted', 'a run of lost agents halts the run')
    assert.ok(run.calls.length <= 4, 'nothing new starts after the halt (' + run.calls.length + ' calls)')
    run = await dryRun(script, { lose: ['accept:autopsy#1'] })
    assert.equal(run.result.status, 'acceptance-incomplete', 'a lost autopsy never reads as a clean acceptance')

    // Resume from journals.
    const jroot = path.join(tmp, 'journals')
    const journal = (id, entries) => {
      fs.mkdirSync(path.join(jroot, id), { recursive: true })
      const lines = []
      entries.forEach(([label, result], i) => { lines.push(JSON.stringify({ type: 'started', key: id + i, label })); if (result !== undefined) lines.push(JSON.stringify({ type: 'result', key: id + i, result })) })
      fs.writeFileSync(path.join(jroot, id, 'journal.jsonl'), lines.join('\n') + '\n')
    }
    const rep = (k) => ({ worktree: '/wt/' + k, branch: 'st-' + k, commits: ['c'], summary: 's', verified: 'v', notVerified: '', blocked: false })
    const fail = (t = 't') => ({ pass: false, blocking: [{ title: t, detail: 'd' }], evidence: 'e' })
    const pass = { pass: true, blocking: [], evidence: 'e' }
    const merged = (c) => ({ merged: true, pushed: true, mainCommit: c, checkOnMain: 'g' })
    journal('wf_one', [
      ['accept:sweep-1#1', { head: 'old', gate: 'g', results: [] }],
      ['implement:a1', rep('a1')], ['verify:a1#1', pass], ['merge:a1', merged('m1')],
      ['implement:b1', rep('b1')], ['verify:b1#1', fail()], ['fix:b1#1'],
      ['implement:a2', rep('a2')], ['verify:a2#1', pass], ['merge:a2'],
      ['implement:b3'],
      ['implement:p1', { ...rep('p1'), blocked: true, blockedReason: 'owner' }],
      ['implement:p2', rep('p2')], ['verify:p2#1', fail('first')], ['fix:p2#1', rep('p2')], ['verify:p2#2'],
      ['implement:a3', rep('a3')], ['verify:a3#1', pass], ['merge:a3', { merged: false, pushed: false, checkOnMain: 'red', problem: 'tests red after merging main' }],
      ['implement:b4', rep('b4')], ['verify:b4#1', fail()], ['fix:b4#1', rep('b4')],
    ])
    journal('wf_two', [
      ['verify:b4#2', fail()], ['fix:b4#2', rep('b4')], ['verify:b4#3', fail()], ['fix:b4#3', rep('b4')], ['verify:b4#4', fail('recurring')],
      ['implement:b2', rep('b2')],
      ['implement:a4', rep('a4')], ['verify:a4#1', fail()], ['fix:a4#1', rep('a4')], ['verify:a4#2', fail()], ['fix:a4#2', rep('a4')], ['verify:a4#3', fail()], ['fix:a4#3', rep('a4')],
      ['verify:a4#4', fail()], ['fix:a4#4', rep('a4')], ['verify:a4#5', fail()], ['fix:a4#5', rep('a4')], ['verify:a4#6', fail()], ['fix:a4#6', rep('a4')], ['verify:a4#7', fail()],
      ['accept:sweep-2#1', { head: 'h', gate: 'g', results: [] }],
    ])
    fs.writeFileSync(path.join(tmp, 'RUNS.txt'), '# runs\nwf_one\nwf_two\n')
    const events = readEvents(readRuns(path.join(tmp, 'RUNS.txt')), jroot)
    const st = deriveState(events)
    assert.equal(st.seed.a1.status, 'merged')
    assert.equal(st.seed.p1.status, 'blocked')
    assert.equal(st.resume.b1.stage, 'fix'); assert.match(st.resume.b1.note, /stopped by a restart/)
    assert.equal(st.resume.a2.stage, 'merge', 'a lost merge is retried (its step 0 finds an earlier landing)')
    assert.equal(st.resume.b3.stage, 'implement'); assert.match(st.resume.b3.existing, /stopped by a restart/)
    assert.equal(st.resume.p2.stage, 'verify'); assert.match(st.resume.p2.note, /reverting a hunk/)
    assert.equal(st.resume.p2.previous.blocking[0].title, 'first', 'a resumed verifier sees what the repair answered')
    assert.equal(st.resume.a3.stage, 'fix', 'a merge refused on a red gate resumes as a repair'); assert.match(st.resume.a3.verdict.blocking[0].detail, /tests red/)
    assert.equal(st.resume.b4.stage, 'fix'); assert.equal(st.resume.b4.roundBase, 3); assert.equal(st.resume.b4.efforts.fix, 'max')
    assert.match(st.resume.b4.note, /ROOT cause/, 'a budget spent across a restart still earns the root-cause round')
    assert.equal(st.seed.a4.status, 'needs-owner', 'after two spent budgets a bundle goes to the owner')
    assert.equal(st.resume.b2.stage, 'verify')
    assert.ok(!st.cache['accept:sweep-1#1'], 'an acceptance result older than a later merge is not replayed')
    assert.ok(st.cache['accept:sweep-2#1'], 'a current acceptance result is replayed')
    assert.equal(deriveState(events, { freshAcceptance: true }).cache['accept:sweep-2#1'], undefined)
    const scope = 'task 2 stays open as an owner note'
    const reopened = deriveState(events, { reopen: { p1: scope } })
    assert.equal(reopened.resume.p1.stage, 'verify')
    const reopenPlan = { ...plan, bundles: plan.bundles.map((b) => (b.key === 'p1' ? { ...b, reopen: scope } : b)) }
    run = await dryRun(render(buildArgs(reopenPlan, profile, reopened)), { failVerify: { p1: 1 } })
    for (const label of ['verify:p1#1', 'fix:p1#1', 'verify:p1#2']) assert.match(run.prompts[label], /task 2 stays open/, 'the reopen scope reaches ' + label)
    args = buildArgs(plan, profile, st)
    run = await dryRun(render(args), {})
    assert.ok(!run.calls.some((c) => c.startsWith('implement:a1')), 'a merged bundle is not rebuilt')
    assert.ok(run.calls.includes('fix:b4#4 [max]') && run.calls.includes('merge:a2 [high]') && run.calls.includes('implement:b3 (resumed) [high]') && run.calls.includes('fix:a3#1 [high]'))
    assert.equal(settledStatus(run, 'a4'), 'needs-owner')
    assert.ok(run.calls.some((c) => c.startsWith('accept:sweep-2#1')), 'no acceptance result is replayed while plan bundles still have to land')
    assert.ok(run.calls.some((c) => c.startsWith('accept:sweep-1#1')), 'the stale sweep is run again')
    assert.throws(() => buildArgs({ ...plan, bundles: plan.bundles.filter((b) => b.key !== 'b3') }, profile, st), /no longer has/, 'resume state for a bundle the plan dropped is refused')
    // A budget spent across a restart (one fix, then three) still earns the root-cause round at max effort.
    journal('wf_four', [
      ['implement:q', rep('q')], ['verify:q#1', fail()], ['fix:q#1', rep('q')], ['verify:q#2', fail()], ['fix:q#2', rep('q')], ['verify:q#3', fail()],
      ['fix:q#3', rep('q')], ['verify:q#4', fail()], ['fix:q#4', rep('q')], ['verify:q#5', fail('recurring')],
    ])
    const four = deriveState(readEvents(['wf_four'], jroot)).resume.q
    assert.equal(four.efforts.fix, 'max', 'the second budget runs at max effort after four fixes')
    assert.match(four.note, /ROOT cause/, 'the second budget carries the root-cause note after four fixes')
    // Acceptance that ran before a plan bundle lands is never replayed: a reopened bundle is accepted afresh.
    journal('wf_five', [
      ['implement:a1', rep('a1')], ['verify:a1#1', pass], ['merge:a1', merged('m1')],
      ['implement:p1', { ...rep('p1'), blocked: true, blockedReason: 'owner' }],
      ['accept:sweep-1#1', { head: 'h', gate: 'g', results: [] }], ['accept:sweep-2#1', { head: 'h', gate: 'g', results: [] }], ['accept:autopsy#1', { report: 'r', findings: [] }],
    ])
    const five = deriveState(readEvents(['wf_five'], jroot), { reopen: { p1: scope } })
    const fivePlan = { id: 'st', bundles: [{ key: 'a1', tasks: [task('x')] }, { key: 'p1', reopen: scope, tasks: [task('x')] }], acceptance: { rounds: 1 } }
    run = await dryRun(render(buildArgs(fivePlan, profile, five)), {})
    assert.ok(run.calls.some((c) => c.startsWith('accept:autopsy#1')), 'acceptance runs again once the reopened bundle lands')
    // Repair bundles of a replayable round are resumed; settled ones are not driven again.
    journal('wf_three', [
      ['accept:sweep-1#1', { head: 'h', gate: 'g', results: [] }], ['accept:sweep-2#1', { head: 'h', gate: 'g', results: [] }],
      ['accept:autopsy#1', { report: 'r', findings: [{ id: 'F0', kind: 'product-defect', severity: 'degrades', title: 't0', detail: 'd', evidence: 'e', files: 'f', area: 'x/a.ts' }, { id: 'F1', kind: 'product-defect', severity: 'degrades', title: 't1', detail: 'd', evidence: 'e', files: 'f', area: 'y/b.ts' }] }],
      ['implement:accept1-1', rep('accept1-1')], ['verify:accept1-1#1', pass], ['merge:accept1-1', merged('r1')],
      ['implement:accept1-2'],
    ])
    const acc = deriveState(readEvents(['wf_three'], jroot))
    run = await dryRun(render(buildArgs({ id: 'st', bundles: [], acceptance: { rounds: 2 } }, profile, acc)), {})
    assert.ok(!run.calls.some((c) => c.startsWith('implement:accept1-1')), 'a merged repair bundle is not driven again')
    assert.ok(run.calls.includes('implement:accept1-2 (resumed) [high]'), 'an interrupted repair bundle resumes')
    assert.ok(!run.calls.some((c) => c.startsWith('accept:autopsy#1')), 'its round\'s autopsy is replayed')
    assert.throws(() => buildArgs({ id: 'st', bundles: [], acceptance: { rounds: 1 } }, profile, acc), /no longer repairs/, 'lowering acceptance.rounds under a resuming repair is refused')

    // Agents never read a missing or stale skill; a fresh orchestration never reuses an id.
    const stale = path.join(tmp, 'stale-skill')
    fs.mkdirSync(path.join(stale, 'references'), { recursive: true })
    assert.throws(() => checkSkillDir(stale), /refresh the reference worktree/)
    fs.cpSync(SKILL, stale, { recursive: true })
    checkSkillDir(stale)
    const repo = path.join(tmp, 'repo')
    fs.mkdirSync(repo)
    execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main'])
    execFileSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'root'])
    checkPlanIdFresh(repo, 'st')
    execFileSync('git', ['-C', repo, 'branch', 'st-old'])
    assert.throws(() => checkPlanIdFresh(repo, 'st'), /was used before/, 'an id with branches is refused')
    execFileSync('git', ['-C', repo, 'branch', '-D', 'st-old'])
    fs.mkdirSync(repo + '-wt-st-x')
    assert.throws(() => checkPlanIdFresh(repo, 'st'), /was used before/, 'an id with worktrees is refused')

    // The router stays in step with the canonical skill.
    const description = (f) => /^description:\s*(.*)$/m.exec(fs.readFileSync(f, 'utf8'))[1]
    assert.equal(description(path.join(SKILL, '..', '..', '..', '.claude', 'skills', 'orchestrated-build', 'SKILL.md')), description(path.join(SKILL, 'SKILL.md')), 'the router\'s description matches the canonical one')
    if (!quiet) console.log('self-test: all checks passed')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

// ------------------------------------------------------------------------------------------------ cli
function opts(argv) {
  const o = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) { o._.push(a); continue }
    const eq = a.indexOf('=')
    const k = eq < 0 ? a.slice(2) : a.slice(2, eq)
    const v = eq < 0 ? argv[++i] : a.slice(eq + 1)
    ;(o[k] ??= []).push(v)
  }
  return o
}
const one = (o, k) => (o[k] ? o[k][o[k].length - 1] : undefined)

/** The primary checkout: the common git directory's parent, so a render from inside a worktree still names it. */
function gitTop() {
  let dir = process.cwd()
  for (;;) {
    const dotgit = path.join(dir, '.git')
    if (fs.existsSync(dotgit)) {
      if (fs.statSync(dotgit).isDirectory()) return dir
      const m = /gitdir:\s*(.+)/.exec(fs.readFileSync(dotgit, 'utf8'))
      if (m) return path.resolve(dir, m[1].trim(), '..', '..', '..')
    }
    const up = path.dirname(dir)
    if (up === dir) throw new UsageError('not inside a git checkout; pass --repo')
    dir = up
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const o = opts(rest)
  const root = one(o, 'journal-root')
  if (cmd === 'render') {
    for (const k of ['plan', 'profile', 'out']) if (!one(o, k)) throw new UsageError('render needs --' + k)
    const plan = JSON.parse(fs.readFileSync(one(o, 'plan'), 'utf8'))
    const profile = resolveProfile(JSON.parse(fs.readFileSync(one(o, 'profile'), 'utf8')), plan, one(o, 'repo') || gitTop())
    const reopen = Object.fromEntries((plan.bundles || []).filter((b) => b.reopen).map((b) => [b.key, b.reopen]))
    const state = one(o, 'runs')
      ? deriveState(readEvents(readRuns(one(o, 'runs')), root), { mainBranch: profile.run.mainBranch, maxFixRounds: profile.run.maxFixRounds, reopen, freshAcceptance: plan.acceptance?.fresh === true })
      : undefined
    const repo = one(o, 'repo') || gitTop()
    if (!state) checkPlanIdFresh(repo, plan.id)
    const args = buildArgs(plan, profile, state)
    checkSkillDir(args.run.skillDir)
    const script = render(args)
    const check = await dryRun(script, {})
    const unsettled = Object.keys(args.bundles).filter((k) => !['merged', 'blocked', 'needs-owner'].includes(settledStatus(check, k)))
    if (unsettled.length) throw new Error('the dry run leaves bundles unsettled: ' + unsettled.join(', '))
    fs.writeFileSync(one(o, 'out'), script)
    console.log('wrote ' + one(o, 'out') + ' (' + script.length + ' bytes); dry run: ' + check.calls.length + ' agent calls, every bundle settles')
    console.log('lanes: ' + (args.lanes.map((l, i) => String.fromCharCode(65 + i) + '=' + l.join(',')).join('  ') || 'none'))
    console.log('live runs: ' + (profile.run.live ? 'authorised ("' + profile.run.live.ownerWords + '")' : 'not authorised'))
    if (state) {
      console.log('settled: ' + (Object.entries(state.seed).map(([k, s]) => k + '(' + s.status + ')').join(', ') || 'none'))
      console.log('resuming: ' + (Object.entries(state.resume).map(([k, r]) => k + '@' + r.stage).join(', ') || 'none'))
      console.log('acceptance replayed: ' + (Object.keys(state.cache).join(', ') || 'none'))
    }
  } else if (cmd === 'status') {
    if (!one(o, 'runs')) throw new UsageError('status needs --runs')
    const s = status(readRuns(one(o, 'runs')), root)
    for (const r of s.rows) console.log(r.join('  '))
    console.log('acceptance agents replayable: ' + (s.acceptance.join(', ') || 'none'))
  } else if (cmd === 'dry-run') {
    const failVerify = Object.fromEntries((o['fail-verify'] || []).map((x) => { const [k, n] = x.split('='); return [k, Number(n)] }))
    const findings = Array.from({ length: Number(one(o, 'findings') || 0) }, (_, i) => ({ area: 'area' + i + '/f.ts' }))
    const run = await dryRun(fs.readFileSync(o._[0], 'utf8'), { failVerify, findings, block: o.block || [], quiet: false })
    console.log(run.calls.join('\n'))
    console.log('status: ' + run.result.status + '; peak concurrency in the stub: ' + run.peak)
    for (const b of run.result.bundles) console.log(b.key + ': ' + b.status)
  } else if (cmd === 'self-test') {
    await selfTest()
  } else {
    throw new UsageError('usage: orchestration.mjs render|status|dry-run|self-test (see the header)')
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e instanceof UsageError ? e.message : e.stack || String(e)); process.exit(e instanceof UsageError ? 2 : 1) })
}
