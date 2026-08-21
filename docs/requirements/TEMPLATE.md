# Templates

Copy-paste skeletons for new entries. See `README.md` for field semantics.

## New requirement (`<block>-<epic-slug>/SWR-<n>-<slug>.md`)

```markdown
---
req-id: SWR-<n>
status: draft
trace: required
test: required
title: "Short requirement title"
epic: SWR-<block>
date: YYYY-MM-DD
---

# SWR-<n> — Short requirement title

Testable requirement statement. Observable acceptance criteria when relevant.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | ... or `N/A — <reason>` | ... | ... |
| Integration | ... or `N/A — <reason>` | ... | ... |
| User-flow E2E | ... | Public product boundary → user-observable result | ... |

Epic: [Epic Title](../<block>-<epic-slug>.md)
```

## New technical requirement (derived / supplementary code)

Use when code you must write has no product requirement of its own (helpers,
refactors, plumbing, internal tooling). The `derived-from` link is mandatory and
must be mirrored back from the originating requirement (see README, "Technical
requirements").

```markdown
---
req-id: SWR-<n>
status: draft
trace: required
test: required
type: technical
derived-from: SWR-<origin>
title: "Short technical requirement title"
epic: SWR-<block>
date: YYYY-MM-DD
---

# SWR-<n> — Short technical requirement title

Testable statement of the supplementary behavior/constraint and why it is needed.

## Test coverage

Describe the unit and/or integration coverage appropriate to this seam and name
the originating product flow enabled by `derived-from`. A separate user-flow
E2E test is not required for a technical requirement.

Derived from: [SWR-<origin> — Origin title](../<block>-<epic-slug>/SWR-<origin>-<slug>.md)

Epic: [Epic Title](../<block>-<epic-slug>.md)
```

Then add, in the originating requirement (or its epic index):

```markdown
Derived requirements: [SWR-<n> — Short technical requirement title](../<block>-<epic-slug>/SWR-<n>-<slug>.md)
```

## New multi-ID spec file (several requirements in one file)

```markdown
---
req-id: [SWR-<n>, SWR-<n+1>]
status: draft
trace: required
test: required
epic: SWR-<block>
date: YYYY-MM-DD
---

# <block>-<epic-slug> spec

## SWR-<n> — First requirement title
status: approved

Testable requirement statement.

### Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | ... or `N/A — <reason>` | ... | ... |
| Integration | ... or `N/A — <reason>` | ... | ... |
| User-flow E2E | ... | Public product boundary → user-observable result | ... |

## SWR-<n+1> — Second requirement title

Testable requirement statement. Inherits frontmatter defaults (draft/required/required).

### Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | ... or `N/A — <reason>` | ... | ... |
| Integration | ... or `N/A — <reason>` | ... | ... |
| User-flow E2E | ... | Public product boundary → user-observable result | ... |

Epic: [Epic Title](../<block>-<epic-slug>.md)
```

## New epic (`<block>-<epic-slug>.md` + empty `<block>-<epic-slug>/` folder)

```markdown
---
req-id: SWR-<block>
status: draft
trace: optional
test: optional
title: "Epic Title"
---

# SWR-<block> — Epic Title

One-paragraph scope description of the feature area.

## Requirements

| ID | Title | Status |
| --- | --- | --- |

## History

(implementation notes, decisions, and follow-ups accumulate here)
```
