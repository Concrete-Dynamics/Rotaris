export const meta = {
  name: 'orchestrated-build',
  description: 'Bundles of tasks through build, independent verification and repair, merged one at a time; then acceptance rounds (proof sweep, live run, autopsy) whose findings go back through the same loop',
  phases: [
    { title: 'Implement', detail: 'one worktree and branch per bundle', model: 'opus' },
    { title: 'Verify', detail: 'an independent verifier tries to fail each bundle', model: 'opus' },
    { title: 'Fix', detail: 'blocking findings go back to a repairer', model: 'opus' },
    { title: 'Merge', detail: 'one merge at a time through the integration worktree', model: 'opus' },
    { title: 'Accept', detail: 'proof sweep, live run and autopsy on merged main', model: 'opus' },
    { title: 'Repair', detail: 'acceptance findings, paired by area, through the same loop', model: 'opus' },
  ],
}

// Rendered by scripts/orchestration.mjs: the marker below is replaced with the run's arguments (plan + profile +
// the state recovered from earlier runs' journals). Unrendered, the Workflow tool's `args` is used.
const A = /*@@ARGS@@*/ null ?? args
const R = A.run
const MODEL = R.model || 'opus'
const MAX_FIX_ROUNDS = R.maxFixRounds || 3
const OUTPUT_RULE = 'Your final text is machine-read by the workflow: return only the structured output the tool asks for.'
const SEED = A.seed || {}
const RESUME = A.resume || {}
const ACCEPT_CACHE = (A.acceptance && A.acceptance.cache) || {}
const SETTLED = ['merged', 'blocked', 'needs-owner']

// ------------------------------------------------------------------------------------------------ schemas
const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    worktree: { type: 'string' }, branch: { type: 'string' }, commits: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' }, verified: { type: 'string' }, notVerified: { type: 'string' },
    ownerBlocked: { type: 'array', items: { type: 'object', properties: { task: { type: 'string' }, reason: { type: 'string' }, recordedAs: { type: 'string' } }, required: ['task', 'reason'] } },
    answers: { type: 'array', items: { type: 'object', properties: { finding: { type: 'string' }, answer: { type: 'string' } }, required: ['finding', 'answer'] } },
    notesMoved: { type: 'array', items: { type: 'string' } }, notesRecorded: { type: 'array', items: { type: 'string' } },
    questionsRaised: { type: 'array', items: { type: 'string' } }, blocked: { type: 'boolean' }, blockedReason: { type: 'string' },
  },
  required: ['worktree', 'branch', 'commits', 'summary', 'verified', 'notVerified', 'blocked'],
}
const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    blocking: { type: 'array', items: { type: 'object', properties: { task: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' }, where: { type: 'string' } }, required: ['title', 'detail'] } },
    optional: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'string' },
  },
  required: ['pass', 'blocking', 'evidence'],
}
const MERGE_SCHEMA = {
  type: 'object',
  properties: {
    merged: { type: 'boolean', description: 'false when the bundle cannot land because of its own content (a conflict you could not resolve, the gate or a proof red on the merged result): it goes back to repair. true when the merged result is green.' },
    pushed: { type: 'boolean', description: 'true when the merge commit is on origin/' + R.mainBranch + '. merged true with pushed false means only the push failed after its retries: the merge is tried again later.' },
    mainCommit: { type: 'string' }, checkOnMain: { type: 'string' }, conflicts: { type: 'string' }, problem: { type: 'string' },
  },
  required: ['merged', 'pushed', 'checkOnMain'],
}
const SWEEP_SCHEMA = {
  type: 'object',
  properties: {
    head: { type: 'string' }, gate: { type: 'string' },
    results: { type: 'array', items: { type: 'object', properties: { proof: { type: 'string' }, status: { type: 'string', enum: ['pass', 'red', 'flaky-red', 'timeout', 'not-applicable', 'blocked'] }, summary: { type: 'string' }, evidence: { type: 'string' } }, required: ['proof', 'status', 'summary', 'evidence'] } },
    hostNotes: { type: 'string' },
  },
  required: ['head', 'gate', 'results'],
}
const LIVE_SCHEMA = {
  type: 'object',
  properties: { head: { type: 'string' }, runs: { type: 'array', items: { type: 'object', properties: {
    what: { type: 'string' }, command: { type: 'string', description: 'the command exactly as the prompt gives it' }, passed: { type: 'boolean' },
    refused: { type: 'boolean', description: 'true when the permission system refused this launch, or a refusal of an earlier one kept you from launching it: the orchestrator runs it' },
    pack: { type: 'string' }, checks: { type: 'string' }, fails: { type: 'array', items: { type: 'string' } },
  }, required: ['what', 'command', 'passed', 'refused', 'pack', 'checks'] } } },
  required: ['head', 'runs'],
}
const FINDING_KINDS = ['product-defect', 'harness-defect', 'proof-red', 'live-check-failed', 'spec-faithful', 'needs-ruling', 'platform-bound']
const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    report: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, kind: { type: 'string', enum: FINDING_KINDS }, severity: { type: 'string', enum: ['blocks-release', 'degrades', 'cosmetic'] },
      title: { type: 'string' }, detail: { type: 'string' }, evidence: { type: 'string' }, spec: { type: 'string' }, files: { type: 'string' }, area: { type: 'string' },
    }, required: ['id', 'kind', 'severity', 'title', 'detail', 'evidence', 'files', 'area'] } },
  },
  required: ['report', 'findings'],
}

// ------------------------------------------------------------------------------------------------ the agent call
// A run of lost agents (a usage limit, an outage) halts the run instead of burning every bundle's budget on nothing.
let lostInARow = 0
let HALTED = false
async function call(prompt, opts) {
  if (HALTED) return null
  const out = await agent(prompt, opts)
  if (out) lostInARow = 0
  else if (++lostInARow >= 3) { HALTED = true; log('HALT: three agents in a row returned nothing (a usage limit or an outage?); no new work starts') }
  return out
}

// ------------------------------------------------------------------------------------------------ prompt parts
const ref = (file) => R.skillDir + '/references/' + file
const trailerBlock = () => '   ' + R.trailers.split('\n').join('\n   ')

function grounding() {
  return [
    '## Read before anything else (binding)',
    '- `' + ref('repository.md') + '`: this repository\'s process (worktrees, the gate, records, commits, numbering collisions, what an agent never edits or decides). It points at the authorities; read the ones your work touches.',
    '- `' + ref('environment.md') + '`: the host (toolchain, headless launches, load, what a restart or a refusal looks like).',
    'CLAUDE.md is in your context; its hard boundaries bind every step, every command and every file you open.',
    'In EVERY shell, first: `' + R.shellPrefix + '`. A command that can run longer than ten minutes runs in the background with the Bash tool\'s own `timeout` parameter (milliseconds, up to 7,200,000) set to cover the longest it may run, its own `timeout` wrapper included (a background task given none is stopped after thirty minutes). Wait for it with the completion notice or the Monitor tool. A polling loop in the shell takes the shape environment.md (Long jobs) gives, alone with nothing before it (the shell prefix does not apply to it): any other `sleep` loop may stop on a permission prompt only the owner can answer.',
    'Never `git stash`: every worktree of the repository shares one stash, so a `pop` can take another agent\'s entry and give yours away. To set a change aside, `git diff -- <files> > <scratchpad>/<name>.patch && git checkout -- <files>`, then `git apply` that patch; or read the base in a throwaway detached worktree.',
    R.live
      ? 'Live runs are AUTHORISED for this round (the owner: "' + R.live.ownerWords + '"); `' + ref('live-runs.md') + '` says how. A refused launch is never retried or routed around: report it as not verified with the exact command you sent; the orchestrator runs it.'
      : 'Live runs are NOT authorised for this round: never launch one; report every live scenario your work names as not verified, with that reason.',
    R.brief ? '\n## Brief for this round (from the orchestrator)\n' + R.brief : '',
  ].join('\n')
}

/** Where a builder or repairer works. A report (`impl`) names the real worktree and branch, which win over the plan's. */
function workspace(bundle, impl) {
  const wt = impl ? impl.worktree : R.worktreePrefix + bundle.short
  const branch = impl ? impl.branch : bundle.branch
  if (impl) return 'Your worktree is `' + wt + '` on branch `' + branch + '`: `cd` into it and read `git status` and `git log origin/' + R.mainBranch + '..HEAD` before anything else.'
  const create = '`git -C ' + R.repo + ' fetch origin ' + R.mainBranch + ' && git -C ' + R.repo + ' worktree add -b ' + branch + ' ' + wt + ' origin/' + R.mainBranch + ' && cd ' + wt + ' && ' + R.shellPrefix + ' && ' + R.setup + '`'
  const reuse = 'If branch `' + branch + '` already exists: when `git -C ' + R.repo + ' merge-base --is-ancestor ' + branch + ' origin/' + R.mainBranch + '` succeeds it is an old, already-merged branch: use `' + branch + '-2` in `' + wt + '-2` instead; otherwise read it and continue on it if it holds useful work of this bundle.'
  return bundle.existing
    ? bundle.existing + ' The worktree `' + wt + '` on branch `' + branch + '` may exist: if it does, `cd` into it, read `git status` and `git log origin/' + R.mainBranch + '..HEAD`, and continue there (an interrupted predecessor of yours made it, even if it holds no commit yet); if it does not, create it with ' + create + '.'
    : create + '. ' + reuse
}

function tasksText(bundle) {
  const tasks = bundle.tasks.map((t, i) => '### Task ' + (i + 1) + ' of ' + bundle.tasks.length + ' — ' + t.title + '\n' + t.body).join('\n\n')
  return bundle.notes ? tasks + '\n\n### Orchestrator\'s notes for this bundle\n' + bundle.notes : tasks
}

function builderRules(bundle, impl) {
  return [
    '## How you work',
    '1. ONE worktree and ONE branch for all your tasks. ' + workspace(bundle, impl),
    '2. Confirm each defect on your branch before changing code; a failing test that reproduces it is the best confirmation. Already repaired? Say so with the commit and line and close it as repository.md says. Each behaviour claim gets a test beside the unit it covers that fails without the change. A proof is evidence: never weaken an assertion the product should meet.',
    '3. Record obligations (repository.md, Records) land in the same commits as the code. A defect you notice outside your tasks is recorded, never fixed on the side. A question the specification leaves open is raised, never ruled by you.',
    '4. Commits: small, one task\'s commits never mixed with another\'s, citing the requirement ids, each ending with exactly these lines after a blank line:',
    trailerBlock(),
    '5. Gate before you finish: `' + R.gate + '` fully green in your worktree; run the narrowest tests while you work; after `' + R.build + '`, run every proof (and, if authorised, live scenario) your tasks name. Do NOT merge, push or remove the worktree: a verifier checks your work and a merge agent lands it.',
    '6. A task only the owner can close (a ruling, a permission, a platform this host lacks): record it as repository.md says, list it in `ownerBlocked` with the reason and the record you made, and finish every other task. Set `blocked` only when NO task can proceed.',
    '7. Report faithfully, PER TASK: what you verified with the exact commands and outcomes, what you could not and why. A skipped step is stated as skipped.',
  ].join('\n')
}

function implementPrompt(bundle) {
  return [
    'You are the BUILDER of one bundle of ' + bundle.tasks.length + ' task(s) in a multi-agent workflow. You build every task in the bundle, in order, on one branch. ' + OUTPUT_RULE,
    '', grounding(), '', builderRules(bundle, null), '', '## Your tasks', tasksText(bundle), '',
    'Build task 1 to completion (confirm, code, tests, record, its own commits), then the next. Return the worktree, the branch, every commit (hash and subject), and per task the summary, what you verified, what you could not, notes moved, notes recorded, questions raised.',
  ].join('\n')
}

function verifyPrompt(bundle, impl, round, ctx) {
  const previous = ctx && ctx.previous
  return [
    'You are the INDEPENDENT VERIFIER of one bundle of ' + bundle.tasks.length + ' task(s). You did not build it. Try to FAIL it: every way it falls short of the requirement, the directive, the defect note, the repository\'s process or its own claims, for EACH task. ' + OUTPUT_RULE,
    '', grounding(), '',
    '## What was asked', tasksText(bundle), '',
    '## What the builder reports (verification round ' + round + ')', JSON.stringify(impl, null, 2), '',
    previous ? '## The previous round\'s BLOCKING findings\nCheck each one FIRST: repaired, or correctly rebutted (the report\'s `answers`)? One neither repaired nor rebutted with evidence is still blocking.\n' + JSON.stringify(previous.blocking, null, 2) + '\n' : '',
    ctx && ctx.note ? '## Orchestrator\'s note for this verification\n' + ctx.note + '\n' : '',
    '## Verify in the builder\'s worktree (`cd ' + impl.worktree + '`; never commit; restore exactly anything you touch)',
    '1. `git fetch origin ' + R.mainBranch + '`; read `git log origin/' + R.mainBranch + '..HEAD` and the FULL `git diff origin/' + R.mainBranch + '...HEAD`. Every commit ends with exactly these lines:',
    trailerBlock(),
    '   Every commit cites its ids and belongs to one task; nothing outside the tasks changes behaviour; nothing an agent never edits (repository.md) is edited unless the orchestrator\'s notes authorise it.',
    '2. Read the requirement, directive and note texts yourself and check every clause against the code. A clause misread or omitted is BLOCKING; so is a word the domain glossary lacks that the code minted.',
    '3. Each behaviour claim has a test beside the unit that fails without the change: read at least two per task, and where cheap revert one hunk, watch the test fail, restore. Missing or vacuous tests are BLOCKING; a weakened proof assertion is BLOCKING.',
    '4. Run `' + R.gate + '` yourself (anything red is BLOCKING; re-run a timing red once alone first). After `' + R.build + '`, run the proofs (and, if authorised, live scenarios) the tasks name and compare with the claims; a claim you cannot reproduce is BLOCKING.',
    '5. Record obligations (repository.md, Records): each one missing, or a record statement no longer true of the branch, is BLOCKING; a note moved that is not actually repaired is BLOCKING.',
    '6. Boundaries (repository.md, Boundaries): every violation is BLOCKING.',
    '7. Adversarially: what input, platform, ordering, crash, restart, concurrent call or loaded host breaks it? Where a test can decide it, run one.',
    'A task the builder lists in `ownerBlocked` is judged on its raise and its record, not on completion: if it truly needs the owner and is recorded as repository.md says, it is not blocking; if an agent could have closed it, it is.',
    'Pass ONLY with zero blocking findings across all tasks; style is `optional`. Every finding names the task, the file and what to change. Put the exact commands and their tails in `evidence`.',
  ].join('\n')
}

function fixPrompt(bundle, impl, verdict, round, extra) {
  return [
    'You are the REPAIRER of one bundle: an independent verifier (or the merge gate) found blocking findings in it, and you repair them on the same branch. ' + OUTPUT_RULE,
    '', grounding(), '', builderRules(bundle, impl), '',
    '## The tasks as they were asked', tasksText(bundle), '',
    '## The report so far', JSON.stringify(impl, null, 2), '',
    '## BLOCKING findings (repair round ' + round + ' of ' + MAX_FIX_ROUNDS + (extra && extra.continued ? ', in a resumed run: earlier rounds ran before a restart' : '') + ')', JSON.stringify(verdict.blocking, null, 2), '',
    '## Optional findings (carry the plainly correct ones; say which you left and why)', JSON.stringify(verdict.optional || [], null, 2), '',
    extra && extra.note ? '## Orchestrator\'s note for this round\n' + extra.note + '\n' : '',
    'Repair every blocking finding at its ROOT: a finding that comes back in a new shape means an earlier repair treated a symptom. If a finding is wrong, do not change code for it: answer it in `answers` with evidence, and the verifier re-checks. Do not start over and do not widen a task. Re-run the gate and every proof the tasks name. Return the same report as the builder, with `commits` listing ALL commits on the branch and `answers` holding one entry per blocking finding.',
  ].join('\n')
}

function mergePrompt(bundle, impl) {
  const pushes = R.pushTargets.map((t) => '`git push origin HEAD:' + t + '`').join(', then ')
  return [
    'You are the MERGE agent for one verified bundle. Within this workflow merges are serialized; another session or workflow may push to origin/' + R.mainBranch + ' at the same time, so origin/' + R.mainBranch + ' is the coordination point. ' + OUTPUT_RULE,
    '', grounding(), '',
    '## The bundle', bundle.title + ' — branch `' + impl.branch + '`, worktree `' + impl.worktree + '`.', 'Summary: ' + impl.summary, '', '### Its tasks', tasksText(bundle), '',
    '## Commit trailers (every commit you make ends with exactly these lines)', trailerBlock(), '',
    '## Steps',
    '0. `git -C ' + R.repo + ' fetch origin ' + R.mainBranch + '`. If `git -C ' + R.repo + ' merge-base --is-ancestor ' + impl.branch + ' origin/' + R.mainBranch + '` succeeds, an earlier merge agent already landed it: report `merged: true, pushed: true` with the merge commit that brought it in (`git log --merges --oneline origin/' + R.mainBranch + ' | grep ' + impl.branch + '`), do step 5, and stop. If the branch no longer exists, `git -C ' + R.repo + ' log origin/' + R.mainBranch + ' --oneline --grep "Merge branch \'' + impl.branch + '\'"` decides the same: a hit means it landed.',
    '1. In the bundle worktree (re-create it with `git -C ' + R.repo + ' worktree add ' + impl.worktree + ' ' + impl.branch + '` if it is gone): a merge left in progress by an interrupted agent is aborted (`git merge --abort`); otherwise `git status` must be clean (else stop and report). `git merge origin/' + R.mainBranch + '`; resolve every conflict by reading both sides, as repository.md (Merge conflicts) says. Stage conflicted paths by name and commit the merge.',
    '2. `' + R.gate + '` in the bundle worktree, fully green. Red because of the merge: fix on the branch and re-run. Red for the bundle\'s own reason: do NOT merge; report `merged: false` with the failing output in `problem` (the bundle goes back to repair).',
    '3. The integration worktree `' + R.integ + '` (detached HEAD; never write in ' + R.repo + '): if it does not exist, `git -C ' + R.repo + ' worktree add --detach ' + R.integ + ' origin/' + R.mainBranch + ' && cd ' + R.integ + ' && ' + R.shellPrefix + ' && ' + R.setup + '`. `git status --short` clean (`git merge --abort` a half-done merge). `git fetch origin ' + R.mainBranch + ' && git checkout -q --detach origin/' + R.mainBranch + ' && git merge --no-ff ' + impl.branch + ' -m "Merge branch \'' + impl.branch + '\': <one line naming the tasks and their ids>" -m "<the trailer lines>"`. It merges cleanly (the branch contains origin/' + R.mainBranch + '); if not, `git merge --abort` and go back to step 1. Then `' + R.afterMerge + '`, `' + R.gate + '`, and after `' + R.build + '` the proofs the tasks name, on the merged result. Red: do not push; report `merged: false` with what failed in `problem` (the bundle goes back to repair).',
    '4. Push from ' + R.integ + ': ' + pushes + ' (a later target rejected as non-fast-forward because someone else pushed it: fetch it and push only if HEAD contains it; not blocking). The push to ' + R.mainBranch + ' rejected because origin moved: fetch, merge origin/' + R.mainBranch + ' (detached; a commit you did not make is someone else\'s: never undo it), re-run the gate, push again. Retry network failures with backoff 2/4/8/16 s. Never force; never reset a shared branch. If the push to ' + R.mainBranch + ' still fails, report `merged: true, pushed: false` with the push error in `problem`.',
    '5. Only after the bundle is on origin/' + R.mainBranch + ': `git -C ' + R.repo + ' worktree remove ' + impl.worktree + '` (`--force` only when the only untracked content is build output or evidence; say so), then `git -C ' + R.repo + ' branch -d ' + impl.branch + '`.',
    'Report the pushed commit, whether pushed, the gate\'s summary line in ' + R.integ + ', and every conflict and how you resolved it.',
  ].join('\n')
}

// ------------------------------------------------------------------------------------------------ the bundle loop
let mergeQueue = Promise.resolve()
function withMergeLock(fn) { const run = mergeQueue.then(fn, fn); mergeQueue = run.then(() => undefined, () => undefined); return run }

// resume: undefined | { stage: 'implement', existing } | { stage: 'fix', impl, verdict, roundBase, note, efforts }
//       | { stage: 'verify', impl, roundBase, previous, note } | { stage: 'merge', impl, verdict, note }
async function drive(bundle, resume) {
  const r = resume || {}
  const base = r.roundBase || 0
  const continued = r.stage === 'fix' || r.stage === 'verify'
  const effort = (stage) => (r.efforts && r.efforts[stage]) || (bundle.efforts && bundle.efforts[stage]) || (stage === 'implement' ? bundle.effort || 'high' : 'high')
  const lost = (status, extra) => ({ key: bundle.key, status: HALTED ? 'halted' : status, ...extra })
  let impl
  if (r.stage === 'fix' || r.stage === 'verify' || r.stage === 'merge') {
    impl = r.impl
  } else {
    const b = r.existing ? { ...bundle, existing: r.existing } : bundle
    impl = await call(implementPrompt(b), { label: 'implement:' + bundle.key + (r.existing ? ' (resumed)' : ''), phase: bundle.phase || 'Implement', schema: IMPL_SCHEMA, effort: effort('implement'), model: MODEL })
    if (!impl) return lost('implementer-lost')
    if (impl.blocked) return { key: bundle.key, status: 'blocked', impl }
  }
  let round = 0
  let verdict = r.stage === 'merge' ? r.verdict || null : null
  let pending = r.stage === 'fix' ? { verdict: r.verdict, note: r.note } : null
  let verifyCtx = r.stage === 'verify' ? { previous: r.previous, note: r.note } : null
  let toMerge = r.stage === 'merge'
  for (;;) {
    if (!toMerge) {
      if (pending) {
        if (round >= MAX_FIX_ROUNDS) return { key: bundle.key, status: 'unverified', rounds: base + round, impl, verdict: pending.verdict }
        round++
        const fixed = await call(fixPrompt(bundle, impl, pending.verdict, round, { continued, note: pending.note }), { label: 'fix:' + bundle.key + '#' + (base + round), phase: 'Fix', schema: IMPL_SCHEMA, effort: effort('fix'), model: MODEL })
        if (!fixed) return lost('fixer-lost', { impl, verdict: pending.verdict })
        if (fixed.blocked) return { key: bundle.key, status: 'blocked', impl: fixed, verdict: pending.verdict }
        verifyCtx = { previous: pending.verdict }
        impl = fixed
        pending = null
      }
      verdict = await call(verifyPrompt(bundle, impl, base + round + 1, verifyCtx), { label: 'verify:' + bundle.key + '#' + (base + round + 1), phase: 'Verify', schema: VERDICT_SCHEMA, effort: effort('verify'), model: MODEL })
      if (!verdict) return lost('verifier-lost', { impl })
      if (!verdict.pass) {
        log(bundle.key + ': verify round ' + (base + round + 1) + ' found ' + verdict.blocking.length + ' blocking finding(s)')
        pending = { verdict }
        continue
      }
    }
    toMerge = false
    const merged = await withMergeLock(() => call(mergePrompt(bundle, impl), { label: 'merge:' + bundle.key, phase: 'Merge', schema: MERGE_SCHEMA, effort: 'high', model: MODEL }))
    if (!merged) return lost('merger-lost', { impl, verdict })
    if (merged.merged && merged.pushed) {
      log(bundle.key + ': merged and pushed (' + merged.mainCommit + ')')
      return { key: bundle.key, status: 'merged', rounds: base + round, mainCommit: merged.mainCommit, impl: summary(impl), optional: verdict ? verdict.optional || [] : [] }
    }
    if (merged.merged) {
      log(bundle.key + ': merged but NOT pushed: ' + (merged.problem || 'no reason given'))
      return { key: bundle.key, status: 'merge-failed', rounds: base + round, impl, verdict, problem: merged.problem }
    }
    log(bundle.key + ': MERGE REFUSED: ' + (merged.problem || 'no reason given'))
    // A red gate on the merged result is a finding like any other: it goes back to repair, within the budget.
    pending = { verdict: { pass: false, blocking: [{ title: 'The gate is red once origin/' + R.mainBranch + ' is merged in', detail: merged.problem || merged.checkOnMain }], optional: [] } }
  }
}
const summary = (impl) => ({ worktree: impl.worktree, branch: impl.branch, commits: impl.commits, summary: impl.summary, ownerBlocked: impl.ownerBlocked, notesMoved: impl.notesMoved, notesRecorded: impl.notesRecorded, questionsRaised: impl.questionsRaised, notVerified: impl.notVerified })

// ------------------------------------------------------------------------------------------------ lanes
const done = {}
const promiseOf = {}
const resolvers = {}
for (const key of Object.keys(A.bundles)) promiseOf[key] = new Promise((res) => { resolvers[key] = res })
for (const key of Object.keys(SEED)) { done[key] = SEED[key]; if (resolvers[key]) resolvers[key](SEED[key]) }

async function runLane(keys, name) {
  for (const key of keys) {
    if (SEED[key]) continue
    if (HALTED) { done[key] = { key, status: 'halted' }; resolvers[key](done[key]); continue }
    let b = { key, ...A.bundles[key] }
    const res = RESUME[key]
    // A resumed bundle's dependencies settled before the restart; waiting on them again could wait on itself.
    if (!res) {
      const unmet = []
      for (const d of b.after || []) { const out = promiseOf[d] ? await promiseOf[d] : null; if (out && out.status !== 'merged') unmet.push(d + ' ended ' + out.status) }
      if (unmet.length) b = { ...b, notes: (b.notes ? b.notes + '\n' : '') + 'Dependencies that did NOT land on ' + R.mainBranch + ': ' + unmet.join('; ') + '. Build on what is on origin/' + R.mainBranch + ', and say in your report what that changed.' }
    }
    log('lane ' + name + ': ' + key + (res ? ' resumes at ' + res.stage : ' starts'))
    let out
    try { out = await drive(b, res) } catch (e) { out = { key, status: 'error', error: String(e) } }
    done[key] = out
    resolvers[key](out)
    log('lane ' + name + ': ' + key + ' → ' + out.status)
  }
}

log('Run: ' + Object.keys(SEED).length + ' bundle(s) already settled; resuming ' + (Object.keys(RESUME).join(', ') || 'none'))
await Promise.all(A.lanes.map((keys, i) => runLane(keys, String.fromCharCode(65 + i))))
const planOutcomes = Object.keys(A.bundles).map((k) => done[k] || { key: k, status: 'missing' })
log('Build: ' + planOutcomes.filter((x) => x.status === 'merged').length + ' of ' + planOutcomes.length + ' bundles merged')

// ------------------------------------------------------------------------------------------------ acceptance
const ACC = A.acceptance || { rounds: 0 }
function acceptAgent(prompt, opts) { return ACCEPT_CACHE[opts.label] ? Promise.resolve(ACCEPT_CACHE[opts.label]) : call(prompt, opts) }
let sweepQueue = Promise.resolve()
function withSweepLock(fn) { const run = sweepQueue.then(fn, fn); sweepQueue = run.then(() => undefined, () => undefined); return run }

function sweepPrompt(half, round) {
  return [
    'You are the ACCEPTANCE SWEEPER (' + half + ' half, acceptance round ' + round + '): every bundle has merged to origin/' + R.mainBranch + ' and you run the built application\'s proofs on it. You change NO product code. ' + OUTPUT_RULE,
    '', grounding(), '',
    '## Setup (the FIRST half does it; the second finds it done: check `git -C ' + R.acceptTree + ' log -1`)',
    '`git -C ' + R.repo + ' fetch origin ' + R.mainBranch + '`; create ' + R.acceptTree + ' with `git -C ' + R.repo + ' worktree add --detach ' + R.acceptTree + ' origin/' + R.mainBranch + '` or, if it exists, check it is clean apart from ignored files and `git checkout -q --detach origin/' + R.mainBranch + '`. Then `cd ' + R.acceptTree + ' && ' + R.shellPrefix + ' && ' + R.setup + ' && ' + R.build + '`, and `' + R.gate + '` once: its summary line goes in `gate` (both halves report it).',
    '## Your proofs',
    'List them with `' + R.proofs.list + '`. The FIRST half runs the first ceil(n/2) in that order, the SECOND the rest. For each, in the background: `' + R.proofs.run + '`. Before each, make sure nothing your previous proof launched is alive. Record exit code, elapsed time, the last ~30 lines and the evidence directory.',
    'Classify each: `pass`; `red` (a failing assertion reproduced by ONE lone re-run); `flaky-red` (the re-run passed: give both); `timeout`; `not-applicable` (the whole proof cannot apply on this platform); `blocked` (it needs what this host lacks, or a human by design). Return `head`, `gate` and every result.',
  ].join('\n')
}
function livePrompt(round) {
  return [
    'You are the ACCEPTANCE LIVE-RUNNER (acceptance round ' + round + '): every bundle has merged and the proof sweep has finished; you run the product against a real model. You change NO code. ' + OUTPUT_RULE,
    '', grounding(), '',
    '`' + R.acceptTree + '` is built at the head the sweep ran on; if origin/' + R.mainBranch + ' has moved since, check it out detached there and rebuild first, and say so.',
    'Run, in order, each in the background and EXACTLY as written: one command with nothing before it (no `cd`, no `export`, no `&&` chain; the shell prefix above does not apply, since each command is complete as written), from whatever directory your shell is in; any other form misses the allow rules the owner may have set (`' + ref('live-runs.md') + '`).' + (R.live.note ? ' ' + R.live.note : ''), ...R.live.runs.map((x, i) => (i + 1) + '. ' + x.what + ': `' + x.command + '`'),
    'If the permission system refuses a launch, launch nothing more: the refusal covers the outcome, so never retry it, split it or reach it another way. Return every run: the refused one and each one not yet launched with `refused: true`, `passed: false`, its `command` exactly as written above and the refusal verbatim in `fails`. The orchestrator runs them.',
    'Return `head` and one entry per run: what, command, passed, refused, pack (absolute path), every PASS/FAIL/NOTE line verbatim in `checks`, each FAIL in `fails`.',
  ].join('\n')
}
function autopsyPrompt(sweeps, live, handed, round) {
  const judged = live && live.runs.length > 0
  return [
    'You are the ACCEPTANCE AUTOPSY (acceptance round ' + round + '): decide what still does not work as specified on merged ' + R.mainBranch + '. READ-ONLY: no edits, no commits, no launches. ' + OUTPUT_RULE,
    '', grounding(), '',
    '## The proof sweep', JSON.stringify(sweeps, null, 2), '', '## The live runs', judged ? JSON.stringify(live, null, 2) : 'none judged this round (' + (!R.live ? 'not authorised' : handed.length ? 'every launch was handed to the orchestrator, below' : 'the live-runner was lost') + ')', '',
    handed.length ? '## Live runs handed to the orchestrator\nThe permission system refused these launches (or a refusal covered them), so this round holds no live evidence of them yet: the orchestrator runs them and has their packs autopsied. Judge none of them. List exactly ONE `live-check-failed` finding for them all, with `area` exactly `' + HANDOFF_AREA + '`, saying the live verdict waits on these runs and naming their commands in `evidence`; it goes to no builder, and the report says the same.\n' + JSON.stringify(handed.map((x) => ({ what: x.what, command: x.command })), null, 2) + '\n' : '',
    'Work in ' + R.acceptTree + '. ' + (judged ? R.autopsy.method + ' ' : '') + 'For every red, timeout and flaky proof, read its output and evidence and decide product or harness. Check every finding against ' + R.defectsDir + ' (open and fixed): a finding a fixed note claims repaired that recurs is a finding, and says so.',
    'Return `report` (per-session report, the sweep table, and a verdict: is it ready to ship on this evidence?) and `findings`: every product defect, harness defect, proof red and failed live check that remains, each with kind, severity, title, detail, evidence, spec (ids or "none found"), files (current file:line) and `area` (the package or file a repair touches; findings are paired by it). A spec-faithful friction is `spec-faithful`, one that needs the owner is `needs-ruling`, one only another platform shows is `platform-bound`. An already-open note is listed with its name in `evidence`.',
  ].join('\n')
}

// The one finding an autopsy lists for live runs handed to the orchestrator carries this area, so it goes to no builder.
const HANDOFF_AREA = 'live runs handed to the orchestrator'
// Once the permission system refused a live launch, the refusal covers the outcome: no later round of this run starts
// a live-runner (that would hand the refused action to another agent); every round hands its live runs to the orchestrator.
let liveRefused = false
async function accept(round) {
  const sweeps = []
  const missing = []
  if (R.proofs) {
    for (const half of ['first', 'second']) {
      const label = 'accept:sweep-' + (half === 'first' ? 1 : 2) + '#' + round
      const s = await withSweepLock(() => acceptAgent(sweepPrompt(half, round), { label, phase: 'Accept', schema: SWEEP_SCHEMA, effort: 'high', model: MODEL }))
      if (s) sweeps.push(s); else missing.push(label)
    }
  }
  let live = null
  if (R.live && liveRefused) live = { head: sweeps.length ? sweeps[0].head : '', runs: R.live.runs.map((x) => ({ what: x.what, command: x.command, passed: false, refused: true, pack: '', checks: 'not launched: a live launch was refused earlier in this run, and that refusal covers this one' })) }
  else if (R.live) { live = await acceptAgent(livePrompt(round), { label: 'accept:live#' + round, phase: 'Accept', schema: LIVE_SCHEMA, effort: 'high', model: MODEL }); if (!live) missing.push('accept:live#' + round) }
  const handed = live ? live.runs.filter((x) => x.refused) : []
  if (handed.length) { liveRefused = true; log('Acceptance round ' + round + ': live runs handed to the orchestrator: ' + handed.map((x) => x.command || x.what).join(' | ')) }
  const judged = live ? { ...live, runs: live.runs.filter((x) => !x.refused) } : null
  const verdict = await acceptAgent(autopsyPrompt(sweeps, judged, handed, round), { label: 'accept:autopsy#' + round, phase: 'Accept', schema: FINDINGS_SCHEMA, effort: 'high', model: MODEL })
  if (!verdict) missing.push('accept:autopsy#' + round)
  return { sweeps, live, handoff: handed.map((x) => ({ what: x.what, command: x.command })), liveJudged: !!(judged && judged.runs.length), verdict, missing }
}

/**
 * Pairs actionable findings that share an area (or, failing that, a directory) into bundles of at most two. A failed
 * live check that waits on runs handed to the orchestrator (its hand-off area, or any when no live run of the round was
 * judged) is no builder's to repair: it stays among the round's findings, and the orchestrator's own runs answer it.
 */
function repairBundles(findings, round, live) {
  const waiting = (f) => f.kind === 'live-check-failed' && (f.area === HANDOFF_AREA || (live.handedOff && !live.judged))
  const actionable = findings.filter((f) => ['product-defect', 'harness-defect', 'proof-red', 'live-check-failed'].includes(f.kind) && !waiting(f))
  actionable.sort((x, y) => (x.area || '').localeCompare(y.area || ''))
  const dir = (a) => (a || '').split('/').slice(0, -1).join('/')
  const groups = []
  for (let i = 0; i < actionable.length; i++) {
    const next = actionable[i + 1]
    if (next && (next.area === actionable[i].area || (dir(next.area) && dir(next.area) === dir(actionable[i].area)))) { groups.push([actionable[i], next]); i++ } else groups.push([actionable[i]])
  }
  return groups.map((pair, n) => {
    const key = 'accept' + round + '-' + (n + 1)
    return {
      key, branch: R.planId + '-' + key, short: R.planId + '-a' + round + '-' + (n + 1), after: [], effort: 'high', phase: 'Repair',
      title: pair.map((f) => f.title).join('; and '), notes: 'Found by acceptance round ' + round + ' on merged ' + R.mainBranch + '.',
      tasks: pair.map((f) => ({ title: f.title, body: [
        'Acceptance finding ' + f.id + ' (' + f.kind + ', ' + f.severity + ').', f.detail, 'Evidence: ' + f.evidence, 'Specification: ' + (f.spec || 'none found'), 'Files: ' + f.files,
        'Record the note first if ' + R.defectsDir + ' has none for it, confirm it on your branch, repair it, pin it with a test, show it with the proof (or, if authorised, live scenario) that found it, and close the note as repository.md says. A finding only the owner can close goes in `ownerBlocked`.',
      ].join('\n') })),
    }
  })
}

async function pool(size, fns) {
  const results = new Array(fns.length)
  let next = 0
  async function worker() { while (next < fns.length) { const i = next++; results[i] = await fns[i]() } }
  await Promise.all(Array.from({ length: Math.min(size, fns.length) }, worker))
  return results
}

const acceptance = []
let status = 'complete'
const unsettled = planOutcomes.filter((x) => !SETTLED.includes(x.status))
if (HALTED) status = 'halted'
else if (unsettled.length) { status = 'incomplete'; log('Acceptance skipped: ' + unsettled.map((x) => x.key + ' ' + x.status).join(', ') + '. Render again to resume them.') }
else {
  for (let round = 1; round <= (ACC.rounds || 0); round++) {
    const acc = await accept(round)
    const findings = acc.verdict ? acc.verdict.findings : []
    acceptance.push({ round, sweeps: acc.sweeps, live: acc.live, handoff: acc.handoff, report: acc.verdict ? acc.verdict.report : null, findings, missing: acc.missing })
    if (acc.missing.length) { status = HALTED ? 'halted' : 'acceptance-incomplete'; log('Acceptance round ' + round + ' lost ' + acc.missing.join(', ') + '; stopping'); break }
    const bundles = repairBundles(findings, round, { handedOff: acc.handoff.length > 0, judged: acc.liveJudged })
    log('Acceptance round ' + round + ': ' + findings.length + ' finding(s), ' + bundles.length + ' repair bundle(s)')
    if (bundles.length === 0 || round === ACC.rounds) break
    const repaired = await pool(R.repairPool || 3, bundles.filter((b) => !SEED[b.key]).map((b) => () => drive(b, RESUME[b.key]).catch((e) => ({ key: b.key, status: 'error', error: String(e) }))))
    for (const x of repaired) if (x) done[x.key] = x
    if (HALTED) { status = 'halted'; break }
  }
  // Done needs the authorized live runs passing: a run whose live launches went to the orchestrator never reads complete.
  if (status === 'complete' && liveRefused) status = 'live-handoff'
}

return {
  status,
  bundles: Object.values(done).map((x) => ({ key: x.key, status: x.status, rounds: x.rounds, mainCommit: x.mainCommit || null, ownerBlocked: x.impl ? x.impl.ownerBlocked : null, notesMoved: x.impl ? x.impl.notesMoved : x.notesMoved, notesRecorded: x.impl ? x.impl.notesRecorded : x.notesRecorded, questionsRaised: x.impl ? x.impl.questionsRaised : x.questionsRaised, notVerified: x.impl ? x.impl.notVerified : null, optional: x.optional || null, lastBlocking: x.verdict && !x.verdict.pass ? x.verdict.blocking : x.lastBlocking || null, blockedReason: x.impl ? x.impl.blockedReason : x.blockedReason, error: x.error || null })),
  acceptance: acceptance.map((a) => ({ round: a.round, gate: a.sweeps.map((s) => s.gate), sweep: a.sweeps.map((s) => s.results.map((y) => y.proof + ':' + y.status).join(', ')), live: a.live, handoff: a.handoff, findings: a.findings, missing: a.missing, report: a.report })),
}
