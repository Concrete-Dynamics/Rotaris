---
name: debug-ui
description: >
  Inspect and correct a visual, layout, styling or interaction defect in the Rotaris desktop UI — a
  surface that looks wrong, clips, overlaps, will not respond to a click, ignores a breakpoint, or
  renders differently maximized. Drives the built app through `pnpm app:drive`, measures the document
  instead of reading the stylesheet, and ends in a proof that fails before the fix and passes after.
  Use for "the workspace looks wrong", "this button does nothing", "check this screenshot",
  "why is there a gap", "the layout breaks at <size>".
---

# Debugging a surface

A stylesheet is a claim and a screenshot is an impression. Neither is evidence. This skill is the loop
that found defects 82–85 in a screen everyone had already looked at: **drive the built app, measure the
document, name the cause in code, then write the assertion whose absence let the defect live.**

Its premise is the repository's own: *nearly every mechanism that went from paper to first execution
held a defect no reading had caught.* A surface is no different. Do not reason about CSS and stop —
the browser is the only authority on what the browser built.

## Before you touch anything

1. **Read the view that covers the area.** `docs/architecture/views/` — the component view for a new
   dependency, the process view for anything crossing a process, the runtime view for the run loop.
   A view that disagrees with your change is a defect *of your change*.
2. **Separate structure from craft.** Which views exist, what they are called, their order, their tabs
   and their fields come from `docs/spec/` (`REQ-SHELL-023` is the definition of the seven views).
   Density, composition, what is a card and what is a line come from `docs/design/` (`pnpm mockup`,
   `http://localhost:8791`, §7's table says which section covers which screen). Where the two disagree,
   **the specification governs, without exception.** A plausible invention is not a third option.
3. **Cite the token, never the literal.** `--rt-surface`, not `#1b1d21`. `pnpm lint` runs
   `tools/check-theme-colours.mjs` and will refuse the literal.

## 1 — Get the app under the driver

```bash
pnpm build                      # the driver drives the BUILT app, not the dev server
pnpm app:drive start            # scratch profile, scripted dialect, stays alive
pnpm app:drive start --fresh --workspace=/path/to/ws   # when profile state is suspect
```

`start` returns while the app keeps running; every later command connects to that same window. That is
the whole point — reading one rectangle used to mean editing a proof script and waiting out a launch.

```bash
pnpm app:drive waitFor ".app-shell" --timeout=30000
pnpm app:drive chord Ctrl+2          # reach the view (Ctrl+1..7 are the seven views)
pnpm app:drive shot look.png
pnpm app:drive maximize              # the size a person actually uses
pnpm app:drive resize 1000 680       # REQ-MONITOR-051's floor
pnpm app:drive log --tail=60         # the app's own words
pnpm app:drive stop
```

Always `stop` when you are done. A live driven app holds the scratch profile and the next `start`
refuses.

## 2 — Measure, do not eyeball

A screenshot tells you *something is wrong*. It cannot tell you *what*. Four probes carry almost every
layout defect this codebase has produced; run them through `pnpm app:drive eval` (it returns the value,
and catches throws into `{ error }`).

**a. Implicit grid tracks — a grid-area naming an area no template declares.**
The browser silently invents a row or column. Invisible to every presence assertion, and the cause of
the dead bands in the Workspace.

```js
JSON.stringify((() => {
  const w = document.querySelector('.workspace');
  const s = getComputedStyle(w);
  const areas = (s.gridTemplateAreas || '').match(/"[^"]*"/g) || [];
  const rows = areas.map(a => a.slice(1, -1).trim().split(/\s+/));
  const names = [...new Set(rows.flat())].filter(n => n !== '.');
  const tracks = v => (v && v !== 'none' ? v.trim().split(/\s+/) : []);
  const kids = [...w.children].map(el => ({
    cls: el.className,
    area: (getComputedStyle(el).gridArea || '').split('/')[0].trim(),
  }));
  return {
    cols: tracks(s.gridTemplateColumns), declaredCols: rows[0]?.length ?? 0,
    rowTracks: tracks(s.gridTemplateRows), declaredRows: rows.length,
    names,
    orphans: kids.filter(k => k.area && k.area !== 'auto' && !names.includes(k.area)),
  };
})())
```

More tracks than declared areas ⇒ implicit tracks. `orphans` names the element that caused them.
`gridArea` reads back as `name / name / name / name` when it resolved to a named area and
`auto / auto / auto / auto` when it did not — the first token is what the author asked for.

**b. Containment — nothing may leave the window.**

```js
JSON.stringify([...document.querySelector('.workspace').children]
  .map(el => { const b = el.getBoundingClientRect();
    return { cls: el.className, bottom: Math.round(b.bottom), right: Math.round(b.right) }; })
  .filter(k => k.bottom > innerHeight + 1 || k.right > innerWidth + 1))
```

Check the primary action by name too. A `Start run` button one pixel below the fold is a failed
requirement, not a cosmetic complaint.

**c. Hit-testing — is the control the topmost thing at its own centre?**
**Run this for every modal, overlay, drawer and sticky bar.** Presence assertions structurally cannot
see a stacking defect: defect 85 was a dialog that was visible, focusable and *not clickable* for its
entire life, because its backdrop carried no `z-index` and it rendered from an earlier grid item than
the composer.

```js
JSON.stringify((() => {
  const el = document.querySelector('[data-testid="..."] button');
  const r = el.getBoundingClientRect();
  const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
  const hit = document.elementFromPoint(cx, cy);
  return { cx, cy, topmost: hit === el || el.contains(hit),
           at: hit && hit.tagName.toLowerCase() + '.' + String(hit.className).split(' ')[0] };
})())
```

**d. Live reactivity — measure *after* a resize, never at mount.**
Defect 83 worked at mount and never again. A breakpoint that is only checked at startup is untested.

```bash
pnpm app:drive resize 1000 680 && pnpm app:drive eval "document.querySelector('.workspace').className"
pnpm app:drive resize 1400 900 && pnpm app:drive eval "document.querySelector('.workspace').className"
```

Give the renderer ~600–700 ms to settle after a resize before measuring. Prove the breakpoint is not a
one-way trip: go down, then back up.

Also available: `inspect <sel>` (every match's box, all attributes, the viewport, what holds focus) and
`probe <sel>` (text, value, `data-*`/`aria-*` — the shape the `*-proof` scripts already read).

## 3 — Name the cause, not the symptom

The measurement gives you a symptom. Do not fix the symptom.

- **Specificity beats order, and `:not()` contributes its argument's specificity.**
  `.workspace:not(.workspace--with-agents)` (0,2,0) beats `.workspace--with-sidebar` (0,1,0) whatever
  the source order says. Compute both sides before believing a rule is "later, so it wins".
- **Grep every class a rule depends on before trusting it.** Defect 82's winning rule keyed off a class
  **set nowhere in the codebase**, so it always matched. A rule guarded by a condition that can never be
  false is an unguarded rule.
- **A duplicate declaration is usually a dead one.** Two grid templates for the same selector means one
  has been silently winning; delete the dead one rather than editing the live one twice.
- **React: an unstable dependency defeats the hook.** `window.matchMedia(q)` returns a *new*
  `MediaQueryList` every call, so building it in the render body rebuilds the subscription each render
  and a `change` event lands on a listener nobody holds. Build it once in `useMemo(..., [])`, subscribe
  in `useEffect`, and **read `matches` once inside the effect** — an event fired between mount and
  subscribe is otherwise lost forever.
- **If a fix makes an unrelated proof red, hit-test before assuming you broke it.** Defect 85 presented
  exactly this way: my grid repair moved the composer over a confirm button that had *already* been
  unreachable. Bisect by stashing your own files first, then ask the document what is at the point.

**Keep the falsified reason beside its replacement.** When you delete a rule that turned out to be
wrong, record in a comment what it claimed and why that was false. Never repair it quietly.

## 4 — End in a proof, or it did not happen

A fix without an assertion is a defect waiting to return. The proof must **fail before your fix and
pass after** — run it against the stashed original to confirm; a proof that was green before the repair
is not proving your repair.

- Extend `apps/desktop/scripts/layout-proof.mjs` when the defect is geometry, stacking or breakpoints.
- Write a new `*-proof.mjs` when it is a surface with its own behaviour: import from
  `./lib/harness.mjs` (`buildDesktop`, `evidenceDirectory`, `cleanEnvironment`) and `./lib/driver.mjs`
  (`startApp`), register it in the root `package.json`, and follow the `check(name, ok, detail)` shape —
  the `detail` string must say what was measured, so a future red reads as a diagnosis.
- Assert the *cause* as well as the symptom (track counts **and** the orphaned `grid-area`), so a
  regression names the element rather than a number.
- If your own new assertion fails against behaviour that is actually correct, that is a defect **of the
  assertion**. Correct it and record why — see the `rows === 0` note in `layout-proof.mjs`.

Then the records, **in the same commit**: `docs/architecture/codebase.md`'s numbered defect ledger, the
affected view in `docs/architecture/views/` plus the "last reconciled" date in its `README.md`, and
`docs/architecture/first-executions.md` when a mechanism ran for the first time. Cite the `REQ-` IDs.

## Traps that have already cost time

| Trap | What happens | What to do |
| --- | --- | --- |
| `resize` on a maximized window | `setContentSize` is a no-op; the op now **refuses** rather than reporting a size nobody got (defect 84) | let it unmaximize itself; never assume a sweep ran at three sizes without reading the replies |
| The packaged app | `__ROTARIS_SEAMS__` strips the driver at build time; `pnpm package` proves it | debug against `pnpm build`, never against a packaged binary |
| Measuring too early | a rect read mid-transition is a rect of nothing | `waitFor` the selector, then ~600 ms before geometry |
| Zero-size matches | the locator refuses them on purpose — a control in a collapsed panel is present and unclickable | if `waitFor` times out on an element you can see, check its box before your selector |
| `cmd \| tail` | reports **tail's** exit status, so a red suite reads as green | redirect to a file and read the file |
| Full-suite reds in `terminal.test.ts` | real-PTY flake under parallel load | re-run the file alone before believing it |
| `pnpm live-run` | spends the owner's real money | **never automatic — ask the owner first** |

## Worked examples

`docs/architecture/codebase.md` defects 82–85, and the header comments of
`apps/desktop/scripts/layout-proof.mjs` and `apps/desktop/src/main/driver.ts`, carry the full accounts:
an unreachable `:not()` rule inventing grid tracks, a breakpoint that fired once at mount, a driver op
that reported a resize it had not performed, and a dialog that was clickable only by luck.
