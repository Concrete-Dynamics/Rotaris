## The requirements-engineer agent still lands work by a merge

`.github/agents/requirements-engineer-rotaris.agent.md`, the GitHub Copilot agent that writes directives, told its
reader that every change "lands on `main` by a merge you perform yourself", to "re-read `main` before merging", and
named "the five merge-conflict shapes". The repository's rule since 2026-10-04 is the opposite: a branch lands by a
rebase onto `origin/main` and a fast-forward push, and `main`'s history is linear with no merge commit (the owner:
"please always use rebase instead of a merge commit for main."). An agent following the file would have produced the
merge commit the rule forbids. Found on 2026-10-26 while the agent configuration was consolidated into `AGENTS.md`,
and repaired in the same change: the three phrases now say rebase and fast-forward push.

## Specs

None in `docs/spec/`. It contradicted the repository's workflow rule (`AGENTS.md`, "Where the work happens";
`docs/clean-room/agent-workflow.md`, "Rebase onto main, and persevere").

## Relevant files

- `.github/agents/requirements-engineer-rotaris.agent.md` — "Where the work happens", the stale wording, repaired.
- `docs/clean-room/agent-workflow.md` — the rule text it now agrees with.
