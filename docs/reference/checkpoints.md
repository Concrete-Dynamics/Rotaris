# Checkpoints and rollback

Rotaris records the working tree after every iteration that changed something,
so any agent step can be undone (SWR-2436), and lets you roll the tree back to
one of those points (SWR-2437). Checkpoints live entirely in a private Git ref
namespace: your branch, your index and your reflog are never touched.

## What a checkpoint captures

A checkpoint is a commit object recording the whole working tree as the
iteration left it:

- **Tracked and untracked files**, honouring `.gitignore` — a file the agent
  just created is exactly the kind of edit you want to be able to undo.
- Its **session id, sequence number, timestamp, iteration number, triggering
  child and the file set** it changed relative to the commit it was taken on.

And, deliberately, what it does **not** capture:

- **`.rotaris/`** — the session snapshots, managed worktrees and locks. A
  restore must never roll back Rotaris's own record of what it did.
- **Your Git state.** No commit is made on your branch, `HEAD` never moves, and
  the index is never written: every index-writing plumbing call runs against a
  throwaway index file supplied through `GIT_INDEX_FILE`. Reflogs are disabled
  for these updates (`core.logAllRefUpdates=false`) and `gc.auto=0` keeps a
  plumbing call from triggering a repack.
- **Anything outside the working tree.** A checkpoint is file contents, not
  process state, not the conversation.

An iteration that changed nothing produces no checkpoint. That is the ordinary
outcome of a read-only iteration, not a failure.

## Where the refs live

```
refs/rotaris/checkpoints/<session-id>/<sequence>
```

Sequence numbers start at 1 and are derived from the highest ever recorded on
the session, so a resume or a prune can never hand out a number that is already
taken. The same mapping is stored on the session snapshot, so checkpoints
survive a resume and can be listed without touching Git at all.

Because the refs are outside `refs/heads/` and `refs/remotes/`, they are
invisible to `git log`, `git branch` and `git status`, and are not pushed by a
default `git push`. Inspect them directly if you want to:

```bash
git for-each-ref refs/rotaris/checkpoints/
git show refs/rotaris/checkpoints/20260808-101500-abcdef123456/3
```

## Configuration

```yaml
checkpoints:
  enabled: true
  max_per_session: 50
  include_untracked: true
```

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | bool or unset | unset | **Three-valued on purpose.** Omit the key to take the per-session default: on in worktree-isolated sessions, where Rotaris owns the tree, and off elsewhere. `true` checkpoints everywhere. An explicit `false` is a decision the resolver never overrides. |
| `max_per_session` | int ≥ 1 | `50` | How many checkpoints one session retains. Older ones are pruned so `refs/rotaris/` cannot grow without bound. |
| `include_untracked` | bool | `true` | Whether untracked files are captured. Turning it off means a newly created file cannot be undone. |

A workspace that is not a Git working tree resolves to *off*. That is not an
error — it is simply a workspace without undo. A failure to checkpoint warns on
the session and never aborts the iteration.

## Listing checkpoints

Rotaris is the primary interface; the CLI subcommand is the headless
equivalent, and both drive the same code.

```bash
rotaris-cli checkpoints list --session 20260808-101500-abcdef123456
```

```
 SEQ  CREATED                     ITER  FILES  KIND
   1  2026-08-08T10:16:04+00:00      1      1  iteration
   2  2026-08-08T10:18:22+00:00      2      2  iteration
   3  2026-08-08T10:21:40+00:00      3      1  iteration
```

`KIND` is `iteration` for an automatic one, `pre_restore` for a safety
checkpoint taken before a rollback, and `manual` for one taken on request.
`--workspace` points at a workspace other than the current directory.
`rotaris-headless checkpoints list …` prints exactly the same rows.

## Restoring

```bash
rotaris-cli checkpoints restore --session <id> --sequence 1 --yes
```

The command prints the preview first — what each file *gets*, not the raw Git
status letter:

```
Restoring checkpoint 1 would change 3 file(s):
  overwrite alpha.txt
  recreate  beta.txt
  delete    gamma.txt
Restored checkpoint 1; 3 file(s) changed.
Safety checkpoint 4 holds the pre-restore state.
```

The `delete`/`recreate` inversion is the direction users most often get wrong:
`gamma.txt` only exists because of a *later* iteration, so restoring an earlier
checkpoint **removes** it. A restore is "return the tree to that state", not
"apply that state on top of this one".

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Restored — or cancelled at the confirmation prompt. |
| `1` | Blocked: uncommitted changes are in the way, or Git refused. The tree is untouched. |
| `2` | No such checkpoint for this session, or a confirmation that cannot be asked for. |

Cancelling deliberately exits `0`: nothing went wrong, you changed your mind.

### Confirmation

`restore` is destructive, so it never runs unattended without `--yes`. With no
`--yes` and nothing interactive on stdin it prints
`Error: a non-interactive restore requires --yes.` and exits `2` rather than
blocking forever on a pipe nobody will answer.

### The dirty-tree block

If you edited files by hand since the last checkpoint and a restore would
overwrite those edits, it refuses:

```
2 uncommitted change(s) would be overwritten: alpha.txt, notes.md. Restore
again with force to overwrite them.
```

Exit code `1`, tree untouched, and the refusal is recorded on the session as a
`checkpoint_restore` issue — a refusal is part of the session's story, not just
the terminal's. Add `--force` to proceed anyway.

The baseline for "uncommitted" is the **last recorded checkpoint**, never
`HEAD`. In a checkpointed session almost everything differs from `HEAD`, so a
`HEAD` baseline would block every restore. What is protected is work done on
top of the last state Rotaris recorded — the only work a restore can destroy
without a copy existing somewhere. `--force` bypasses that one check and
nothing else: a missing ref or a Git failure still refuses.

### The safety checkpoint

Before changing a single file, a restore records a `kind="pre_restore"`
checkpoint of the current tree, so the rollback can itself be rolled back. If
that checkpoint cannot be taken, the restore does not happen — an irreversible
restore is exactly what SWR-2437 forbids.

The one benign exception is a tree that already matched the last commit: there
was no new state to record, and none to lose. The command says so:
`No safety checkpoint was needed: the working tree already matched the last
commit.`

A restore never rewrites branch history. It changes working-tree contents and
nothing else — `git rev-parse HEAD` and `git symbolic-ref HEAD` read exactly
the same before and after.

## Pruning

After every capture, everything beyond `max_per_session` is deleted — the refs
and the recorded mapping together, so the session never offers a restore
pointing at a ref Git no longer has. One session therefore cannot grow the
`refs/rotaris/` namespace without bound.

> **Known gap.** Deleting a session does *not* yet delete its checkpoint refs.
> `CheckpointService.discard_session()` exists and does exactly that, but
> nothing on the session-deletion path calls it, so refs for deleted sessions
> accumulate. Until that is wired up, clean them out by hand:
>
> ```bash
> git for-each-ref --format='%(refname)' refs/rotaris/checkpoints/ \
>   | xargs -n1 git update-ref -d
> ```

## Python surface

```python
from rotaris_core.session import SessionManager
from rotaris_core.session.checkpoint_restore import CheckpointRestorer

restorer = CheckpointRestorer(
    session_manager=SessionManager(workspace),
    session_id=session_id,
)

for checkpoint in restorer.list_checkpoints():
    print(checkpoint.sequence, checkpoint.iteration, checkpoint.files)

preview = restorer.preview(1)          # never touches the tree
result = restorer.restore(1, force=False)
```

Neither `preview` nor `restore` raises. A refusal comes back as a populated
`blocked_reason` — "you have uncommitted work in the way" is a thing to render
in a dialog, not a traceback. `restorer.available` is `False`, never an
exception, for an unknown session or a tree Git does not manage.

`rotaris_core.session` is internal API; only the names in
`rotaris_core.sdk.__all__` are covered by the SDK stability contract, see
[python-sdk.md](python-sdk.md).
