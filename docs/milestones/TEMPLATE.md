# Template

Copy-paste skeleton for a new milestone. See `README.md` for field semantics.

## New milestone (`M<n>-<slug>.md`)

```markdown
---
milestone: M<n>
title: "Short milestone title"
status: planned
branch: milestone/m<n>-<slug>
target-version: "0.<minor>.0"
opened: YYYY-MM-DD
epics: [SWR-<block>]
requirements: [SWR-<n>]
excludes: []
---

# M<n> — Short milestone title

One paragraph: what shipping this milestone means for someone using Rotaris.
Not a task list — the member requirements are the task list.

## Scope

Why these epics and requirements belong together, and what was deliberately
left out. Every id in `excludes:` gets a line here saying why.

## Exit criteria

Everything beyond the mechanical gate — anything a person has to confirm.

- [ ] the compact download disclosure re-checked against SWR-3715/SWR-3003
      (`docs/reference/releasing.md`, "Before promoting the release")
- [ ] ...

## History

(decisions, scope changes, and what the milestone taught us)
```

Once the milestone is released, add to the frontmatter:

```yaml
status: released
released-version: "0.121.0"
released-on: YYYY-MM-DD
```
