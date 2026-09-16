---
paths:
  - ".claude/rules/*.md"
---

# Path-scoped rules — what belongs here

Each file here carries `paths:` frontmatter, so it enters context only when a file it names is read.
That is the whole reason they exist: `CLAUDE.md` is loaded every session and must stay short, while an
invariant that binds one subtree can afford to be stated where it binds.

Three constraints on a rule in this directory:

1. **It states what the code cannot show and the lint does not yet catch** — an ordering, a closed
   vocabulary, a defect this repository has already paid for. Anything a reader learns from the file
   in front of them does not go here.
2. **It points at its authority rather than restating it.** The ordered edit paths live in
   `docs/architecture/views/04-seams.md`, the allowed edges in `01-component-view.md`, the vocabulary
   in `CONTEXT-MAP.md`, the evidence in `AGENTS.md`. A rule that copies one of those is the copy that
   drifts.
3. **It stays under roughly twenty-five lines.** A rule long enough to skim is long enough to ignore.

These files are repository content, like `.claude/skills/` and for the same reason: they are procedures
the work depends on, and a fresh clone must carry them. Both are negations inside `.gitignore`'s
`.claude/*`.
