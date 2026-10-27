# Git Integration, Worktrees, and Checkpoints — On-disk layout (base workspace)

Part 7 of 8 of [domain 06](../06-git-worktrees-checkpoints.md), which indexes every part.

## Data & Formats

All formats below are externally observable on disk, in the repository, or on the event stream.

### On-disk layout (base workspace)

What a session records — its listing record with the worktree binding and `checkpoint_count`, its lock, its timeline entries and its recorded issues — is held in the durable session store, not on this layout. Where that store is, and what it holds, are REQ-SESSION-001's, REQ-SESSION-198's and REQ-SESSION-002's; this document names no path for any of them. What remains on disk in the base workspace is the working material below.

```
<workspace>/.rotaris/
  worktrees/<session-id>/            # isolated session worktrees (subpath configurable)
  worktrees/integrations/<integration-id>/   # temporary integration worktrees (under the same subpath)
  requirements/worktrees/<unit-id>/  # requirement-unit worktrees; this location is fixed by REQ-GIT-137 and no configuration key names it
  integration.lock       # exclusive-create; JSON {"session_id", "pid", "host", "started_at"}
                         # never created where the workspace's storage cannot make exclusive create
                         # exclusive; the integration is refused instead (REQ-GIT-128, REQ-STARTUP-166)
```

### Git namespaces

- Checkpoint refs: `refs/rotaris/checkpoints/<session-id>/<sequence>` (REQ-GIT-029; numeric sequences; commit objects carrying the fixed identity REQ-GIT-032 fixes).
- Session isolation branches: `rotaris/session/<session-id>` (REQ-GIT-007), with the collision suffixes `-2`, `-3`, … of REQ-GIT-010.
- Integration branches: `rotaris/integration/<integration-session-id>` (REQ-GIT-130).
- Requirement branches: `rotaris/req/...` (templates per REQ-GIT-074/139, placement per REQ-GIT-137); the three prefixes are mutually exclusive namespaces (REQ-GIT-138).

### Persisted records (behavioral schemas)

- Worktree binding: the record REQ-GIT-015 defines. That requirement is normative for the field set, the `merge_status` vocabulary and the defaults; this line names the record only so the layout above can refer to it.
- Checkpoint record: the record REQ-GIT-016 defines, which is normative for the field set and the defaults; its `kind` takes the vocabulary REQ-GIT-067 closes. The names by which the fields are written are `sequence` (int), `ref` (string), `commit` (string), `created_at` (timestamp), `iteration` (int, default 0), `child_name` (string, default empty), `files` (list of paths changed relative to the parent commit), and `kind`.
- Session record (checkpoint-related fields only): `checkpoint_count` (int), `last_restored_sequence` (int or null, default null — REQ-GIT-155).

### Commit message formats (fixed identity `rotaris <rotaris@local>`, which REQ-GIT-032 fixes and REQ-GIT-144 limits to checkpoint objects and integration acceptance commits)

- Iteration checkpoint: `rotaris checkpoint <sequence> for session <session-id> (iteration <n>[ by <child-name>])` (REQ-GIT-047)
- Safety checkpoint: `rotaris pre-restore checkpoint <sequence> for session <session-id> (before restoring checkpoint <target>)` (REQ-GIT-058, gate 5)
- Integration acceptance commit (in a source worktree): `Rotaris: accept session <session-id> worktree changes` (REQ-GIT-129)
- Repository-setup first commit (user identity, not the fixed identity): `Initial commit` (REQ-GIT-113)

### Event shapes (stored event stream)

- `checkpoint.created`: the payload REQ-GIT-067 defines. That requirement is normative for the field set, each field's name and meaning, and the closed `kind` vocabulary; this line names the event only so the stream can be located here.
- `checkpoint.restored`: the payload REQ-GIT-068 defines, which is normative for its field set and for the rule that `safety_sequence` may be set even when `restored` is false; this line adds nothing to it.

### Shared textual formats

- Checkpoint listing: presented only in the desktop table widget of REQ-GIT-086, with that requirement's column headings, the local-time timestamps of REQ-GIT-090, and rows oldest first. There is no textual listing format.
- Preview text (fixed character-for-character wherever a preview is shown, which is the desktop confirmation dialog, REQ-GIT-064/097): `Restoring checkpoint <n> would change <k> file(s):` then `  <verb padded to 9> <path>` lines in ascending path order; the nothing-to-change, blocked-reason-only, and dirty-warning variants per REQ-GIT-064.
- Ascending path order, everywhere in this domain: ascending byte order of the path's UTF-8 encoding (REQ-GIT-057).
- Desktop Files cell: `+<additions> -<deletions> / <files-touched>` (REQ-GIT-077, over the figures REQ-GIT-107 defines); sync label `ahead <n>  behind <m>` (REQ-GIT-075, over the counts REQ-GIT-105 collects, with the empty rendering of REQ-GIT-112); cleanup list rows `<branch>  →  <path>` (REQ-GIT-135); session rows `<branch or —> · <state>` (REQ-GIT-122); checkpoint picker entries `<session-id> · <branch>` (REQ-GIT-086).

### Configuration surface (layered YAML)

Each key's type, default and validation are fixed by the requirement named beside it; this list holds
no second copy of any of them and exists so the surface can be read in one place.

- `checkpoints.enabled`: bool or null (default null; see REQ-GIT-044/070)
- `checkpoints.max_per_session`: int (default 50, min 1; see REQ-GIT-071, which also fixes what a value below 1 does)
- `checkpoints.include_untracked`: bool (default true; see REQ-GIT-072)
- `worktree_storage_subpath`: string (default `worktrees`; see REQ-GIT-073, over the key REQ-CONFIG-068 registers)
- `integration.validation_command`: string or null (default null; see REQ-GIT-156)
- Requirement execution: `branch_template`, `integration_branch_template`, `target_branch`, `keep_failed_worktrees`, `retry_limit`, `unit_timeout_minutes` (defaults per REQ-GIT-074). `worktree_subpath` is **not** a key of this surface: the only key naming an isolated-checkout directory is `worktree_storage_subpath` above, and a `worktree_subpath` written under `requirements.execution` is reported and ignored rather than rejected, the workspace opening and every other key loading as though it were absent (REQ-CONFIG-194, REQ-CONFIG-183, REQ-GIT-074).

Desktop-only preferences are NOT part of this surface: the post-merge cleanup prompt preference `interface/worktreeCleanupPrompt` (REQ-CONFIG-405) and the Git view's column split position (REQ-SHELL-069) live in the per-user desktop preference store, whose key set is registered by REQ-SHELL-006. This domain names no preference key of its own (REQ-GIT-153).
