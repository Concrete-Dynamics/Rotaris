[Product directives](../directives.md) › PD-TOOLS-007

<a id="pd-tools-007"></a>

### PD-TOOLS-007 — a `write_file` call with no operation is read as a create when its file does not exist

Beside REQ-TOOLS-032's three repairs, the product SHALL make a fourth, and only this one. A `write_file` call (REQ-TOOLS-135)
that the schema refuses after the three, and that

- names no `operation`,
- carries a path (`path`, or its alias `file_path`) and a `content`, each a string, and
- carries none of the fields only another operation reads: no `old_string`, no `new_string`, no `insert_line`, and no
  `replace_all` set true,

SHALL be read as a `create` when the path it names, resolved and fenced as a write is (REQ-TOOLS-129), does not exist.
The call is then dispatched as an ordinary call with `operation: create`: the tool-call record, the row, the permission
request, a session approval's match (`PD-TOOLS-004`) and the tool hooks all see the `create`. Its result SHALL carry, after
what the create itself reports, the sentence `No operation was given, so this call was read as 'create': <path> did not
exist. Name the operation on every write_file call.`

A call that names an existing file, or one that does not meet all three conditions, is NOT repaired: it is refused as
REQ-TOOLS-032 states, naming the missing field with an example, and where the path names an existing file the refusal
also says `<path> already exists, so the call was not read as a create; name 'overwrite' or 'edit'.` The inference never
overwrites: a file that appears between the reading and the write is refused by the create itself (`File already exists`).

Everything else REQ-TOOLS-032 fixes still governs: its three repairs, their order before schema validation, and the
recoverable refusal of every other call still invalid after them. REQ-TOOLS-135's operations, its refusals and its
success messages are unchanged.

**Why, and what it costs.** The intent of such a call is unambiguous, and no existing file can be overwritten by reading
it. Wording could not make a first use succeed: the description and the refusal both name the field, and the schema
marks it required, yet the duress runs refused 1 of 4, 2 of 5 and, on 2026-10-06, 4 of 6 children's first `write_file` for
want of it, each child then regenerating its whole file. One run's two refusals cost about 77 seconds and 7,000 output
tokens, the last one's five about 179 seconds and 17,000. What is given up: the product now acts on a call the model got
wrong, rather than telling it so first. The result says what was read, so the model is still told, after the fact.

> **Extends:** REQ-TOOLS-032

*Raised by the owner, 2026-10-06, ruling OQ-139 as recommended; logged as [R-071](../requests.md#r-071).*

> **First execution, 2026-10-06, built under [R-071](../requests.md#r-071) (fin21):** the rule held as written. The repair
> is the tool's, offered to the gate as `inferArguments` on the executor (`packages/agent-tools/src/tools/{types,files}.ts`)
> because only the tool holds the fence its path is resolved through; the gate (`gate.ts`) asks it only for a call the
> schema still refuses after REQ-TOOLS-032's repairs, validates what it returns, and carries the sentence into the result.
> It runs before the evidence record opens, so the record, the row's label and the approval all read the `create`.
> **Readings taken where the text leaves room:** a `replace_all: false` sent explicitly does not bar the reading, since
> false is the field's default and says nothing of another operation; an argument outside the tool's fields is not
> checked, since the schema strips it; a path the fence refuses is not read as anything, and is refused as before. **What
> was measured.** Four cases in `gate.test.ts` through the real tool and a real temporary directory — the duress run's
> shape created with the sentence, `file_path` too; an existing file refused, saying so, its content untouched; seven
> shapes not inferred; the inferred call's approval asked for the `create` and a session approval of it covering a later
> edit of the path — three of them red on the code before the build (the fourth, the negatives, holds either way). Two
> earlier cases sent the run's shape expecting the refusal, and now send a shape the directive does not cover. **What was
> not measured.** No live run has met the shape since: `pnpm live-run`'s `frictions` and `duress` scenarios now check that
> no create-shaped call was refused for want of an operation (`lib/tool-frictions.mjs`), and that is their next run's to
> show. The note is repaired:
> [`write-files-first-use-refusal-recurred-under-duress.md`](../../defects/fixed/write-files-first-use-refusal-recurred-under-duress.md).
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **The live shape, 2026-10-06 (fin23).** The default live run at `c2a9444` met the directive in two sessions its check
> did not read: the resume session's ordinal 9 was read as a create, the sentence in its result — the directive's first
> live execution — and the requirements session's ordinal 62, a create-shaped call naming a path outside the workspace,
> was refused as the reading above says a fenced path is. The run's NOTE said the inferred create "was not asked this
> run", because the check read the `frictions` and `duress` sessions only, and it could not have seen a refused whole-file
> write in any session, whose arguments the record stores cut to a string. Since fin23 the check reads every session the
> run keeps, reads cut arguments, and reports a fenced refusal without failing it:
> [`the-live-runs-tool-friction-checks-read-two-scenarios-and-miss-a-refused-call-whose-arguments-were-cut.md`](../../defects/fixed/the-live-runs-tool-friction-checks-read-two-scenarios-and-miss-a-refused-call-whose-arguments-were-cut.md).
>
> **The fence it judges by, 2026-10-06 (fin25).** fin23 judged every session's fence by the sandbox's workspace, while a
> requirements run is fenced to its worktree under `<workspace>/.rotaris/requirements/worktrees/…` (the requirements
> session's ordinal 66 at `c2a9444` was refused "outside workspace root '<that worktree>'"), so a create-shaped call naming
> a workspace path outside the worktree would have read as the old shape. Since fin25 each session is judged by the fence
> its own record names (`fenceRootOf`, the session's `worktree` before its `workspace_root`):
> [`the-live-runs-pd-tools-007-check-judges-a-requirements-runs-fence-by-the-workspace.md`](../../defects/fixed/the-live-runs-pd-tools-007-check-judges-a-requirements-runs-fence-by-the-workspace.md).
> The same round aligned the check's create shape with the product's own (`createOnlyTarget` and the schema the gate
> applies after it): a call carrying `replace_all: false` or a key no operation reads is create-shaped, an empty path or a
> `file_path` that is no string is not, and a test runs both readers over the same nineteen shapes:
> [`the-live-runs-create-shape-reading-differs-from-the-products-create-only-target.md`](../../defects/fixed/the-live-runs-create-shape-reading-differs-from-the-products-create-only-target.md).
>
> **The built app, and a live run that asks, 2026-10-13 (fin42).** The shape had met the product live only by chance, and no
> proof had sent it: the scripted `write` step names its operation, and the live run's `frictions` prompt said only "Create a
> file", so a model that read the schema named the operation and every run since printed "PD-TOOLS-007's inferred create was
> not asked" ([`the-live-runs-frictions-prompt-never-asks-pd-tools-007s-inferred-create.md`](../../defects/fixed/the-live-runs-frictions-prompt-never-asks-pd-tools-007s-inferred-create.md)).
> `pnpm tool-shapes-proof` now sends it through the built application with the scripted step `writeinfer`: for an absent
> file the call settled `ok`, its result carrying the sentence and its record `operation: create`, and the file landed; for
> an existing one it was refused `invalid_request`, saying the file exists, its content untouched, with the `tool_error` issue
> REQ-SESSION-136 files for it. Held as written; nothing found. The `frictions` prompt asks for the write with only `path` and
> `content`, and checks it read as a create: the next default live run's to show.
