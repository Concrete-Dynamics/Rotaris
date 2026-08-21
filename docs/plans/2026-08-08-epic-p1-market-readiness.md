# Epic P1 — Market-Readiness Completion (waves)

Integration branch: `epic/p1-market-readiness`. Every unit PR targets that branch,
never `master`.

Scope: gaps 5 (lifecycle hooks, SWR-2701–2704), 6 (Python SDK, SWR-1830),
7 (checkpoints + rollback, SWR-2436/2437) and the paperwork half of gap 8
(SWR-2806/2807 are implemented but still `draft`). Gap 4 (OS-level sandbox) shipped
2026-08-07 and is out of scope.

## Decisions taken before planning

| Question | Decision |
| --- | --- |
| Workspace-scope hooks are an RCE vector (`<workspace>/.rotaris/agents.yaml` ships in a clone) | Global `~/.config/rotaris/` hooks always run. Workspace-declared hooks require a one-time trust verdict per workspace + hook-set digest, stored in `<workspace>/.rotaris/hook-trust.json`. Untrusted → skipped with a visible notice. |
| SWR-1830 cites `ralph/bootstrap.py` as the run bootstrap, which has no run entry point | Extract the lifecycle out of `cli/background.py::run_background` into a host-neutral `src/rotaris_core/run_host.py::execute_run()`; CLI and SDK both call it. SWR-1830's wording is corrected in the final unit. |
| What a checkpoint captures | Tracked **and** untracked files, honouring `.gitignore`. |
| Gap 8 | Paperwork only — flip SWR-2806/2807 to `approved`, fix the epic frontmatter, update the NOTE row. |

## Spec-vs-code disagreements found in research

1. `ralph/bootstrap.py` is a factory toolkit, not a run bootstrap (see decision above).
2. SWR-2703 says to bridge from the `RalphIterationObserver` seam, but that seam has no
   `session_start` / `session_end` hooks. Unit U8 adds them next to the existing
   `_publish_session_*` calls in `ralph/loop.py`.
3. SWR-2436/2437 are missing from the `2400-git-worktrees.md` epic index table.
4. `2800-project-initialization.md` frontmatter says `status: draft` while every section
   inside says `approved`; SWR-2806/2807 are fully traced and tested but still `draft`.
5. `src/rotaris_core/__init__.py` `__version__` (0.75.2) disagrees with `pyproject.toml`.
6. There is no ground truth anywhere for "which files did iteration N change" — the
   checkpoint engine computes it from `git status --porcelain` in the checkpointed tree.

## Units and waves

| Unit | Wave | Title | Requirements |
| --- | --- | --- | --- |
| U1 | 1 | Hook + checkpoint config schema and models | SWR-2701 |
| U2 | 1 | Checkpoint git engine (`refs/rotaris/checkpoints/…`) | SWR-2436 |
| U3 | 1 | Host-neutral run entry + Python SDK | SWR-1830 |
| U4 | 2 | Hook runner, payload building, failure handling | SWR-2702, SWR-2703, SWR-2704 |
| U5 | 2 | Checkpoint session service, session state, prune | SWR-2436 |
| U6 | 2 | Workspace hook trust gate | SWR-2701 |
| U7 | 3 | Tool-hook dispatch in the agent gate | SWR-2702 |
| U8 | 3 | Session/lifecycle observer hooks + checkpoint observer wiring | SWR-2703, SWR-2436 |
| U9 | 3 | Checkpoint restore engine + CLI subcommand | SWR-2437 |
| U10 | 4 | Rotaris UI — checkpoints list/restore, hooks tab, trust prompt | SWR-2437, SWR-2704 |
| U11 | 4 | Hook diagnostics surfacing + hooks user-flow E2E | SWR-2704 |
| U12 | 5 | Finalisation — status flips, spec corrections, back-links, versions | all |

File ownership is disjoint within each wave; dependencies flow forward only. No unit
except U12 edits any file under `docs/requirements/` or flips a `status:` field.
