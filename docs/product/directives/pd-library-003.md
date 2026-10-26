[Product directives](../directives.md) › PD-LIBRARY-003

<a id="pd-library-003"></a>

### PD-LIBRARY-003 — an artifact's body is its document, and a person's edit of it survives and travels

*Revision 2 (2026-10-13, [R-072](../requests.md#r-072), ruling [OQ-272](../../architecture/open-questions/57-spikes-and-later-questions-24.md#oq-272)) — **the
frontmatter is the record's in the inspector and at a save**: clause (f)'s second sentence is replaced and clause (c) gains one
sentence, each replaced sentence quoted beneath its clause; the costs paragraph loses one cost and gains two, the replaced
wording quoted beneath it; REQ-LIBRARY-133 joins the Extends line.*

**(a) The body.** The record's `body_markdown` SHALL be the Markdown document REQ-LIBRARY-087 keeps on disk, created as
REQ-LIBRARY-090's rendering.

**(b) The submitted body, kept twice.** A publish SHALL keep the submitted body unchanged in `key_findings` and as the
document's Key Findings section. The section drops only the blank lines before the body's first line and after its last.
Both copies are intended.

**(c) An edit.** An edit replaces the document and stamps `edited_at`. `key_findings`, `summary` and every other column keep
their published values, as REQ-LIBRARY-094 is written, and REQ-LIBRARY-099's section filter reads those columns. A save writes
the record's frontmatter (with the new `edited_at`) in place of the document's leading block, or in front of the text when none
is found, as clause (d) does at a re-render. *(Revision 2, OQ-272.)*

> **Revision 1's clause (c) said, and no longer governs alone** (OQ-272): it ended at "and REQ-LIBRARY-099's section filter reads
> those columns." and said nothing of the frontmatter a save writes, so the document was written as the inspector sent it.

**(d) A re-render keeps the edit.** A re-render of a record a person has edited SHALL rewrite the document's leading
frontmatter block from the record, or put a block in front when none remains, and keep everything after it as saved. This
covers REQ-LIBRARY-095's supersession and REQ-LIBRARY-092's re-materialisation. A document that cannot be read is left as it
is; a document that is absent is written whole from the record.

**(e) The handoff carries the edit.** REQ-SESSION-115's handoff SHALL carry an edited artifact as its document with the
frontmatter removed, within the same 6,000 characters, and its header marks it `edited`. An unedited artifact, or one whose
document cannot be read, is carried from its columns as before.

**(f) The Preview.** The inspector's Preview (REQ-LIBRARY-132) SHALL render the document from below its leading frontmatter
block. The Markdown tab shows the whole document: its leading frontmatter block read-only, and the text below it in the editor;
Save sends the block as loaded followed by the edited text. *(Revision 2, OQ-272.)*

> **Revision 1 said, and no longer governs** (OQ-272): "The Markdown tab shows and edits the whole document."

A frontmatter block is one whose first line is `---`, which closes at the next `---` line, and in which every line between is
a `key: value` line.

**Why, and what it costs.** REQ-LIBRARY-087, REQ-ORCH-149 and REQ-SESSION-002 all make an artifact's body a file on disk that
the record never holds, and REQ-LIBRARY-093 says a publish's `body_markdown` is the submitted body unchanged: both cannot be
literally true of one stored thing ([OQ-210](../../architecture/open-questions.md)). The build kept the document as the body and
the submitted body in `key_findings` and the Key Findings section, which REQ-LIBRARY-088, 093 and 087 together require; this
directive records that departure from REQ-LIBRARY-093's text. Confirming it exposed a defect: a re-render wrote the rendering
of the columns over a document a person had saved, while `edited_at` and ` · edited` stayed
([the defect note](../../defects/fixed/a-re-render-writes-over-a-persons-saved-artifact-edit.md)). If the document is the body,
a re-render of an edited one refreshes only what the record owns, its frontmatter, and the person's correction is what the
next agent is handed. What it costs: an agent reading a published artifact sees its first line twice (in Summary and in Key
Findings) and a few hundred characters of frontmatter, which spend REQ-LIBRARY-098's budget a little faster; a large
published body is stored both in the record and on disk; after an edited child report is re-materialised the document keeps
the person's text while the columns, the Library summary and the section filter show the new report, so the two can
disagree, and ` · edited` is what says so; REQ-LIBRARY-134's empty-body fallback applies only to an empty or truncated file;
a person cannot change frontmatter text from the inspector, and none of their changes there were ever kept; and a document whose
block an earlier edit broke is shown whole and editable, its next save puts a fresh block in front, and the broken lines remain
as text (and travel in the handoff) until the person removes them. *(Revision 2, OQ-272.)*

> **Revision 1's costs said, and no longer govern** (OQ-272): "…and ` · edited` is what says so; a person who deleted the
> frontmatter sees it come back at the next re-render; and REQ-LIBRARY-134's empty-body fallback applies only to an empty or
> truncated file." Since revision 2 the inspector offers no way to delete the frontmatter, and a save puts it back at once.

> **Narrows:** REQ-LIBRARY-093, REQ-LIBRARY-095
> **Extends:** REQ-SESSION-115, REQ-LIBRARY-132, REQ-LIBRARY-133

*Revision 2, 2026-10-13 ([OQ-272](../../architecture/open-questions/57-spikes-and-later-questions-24.md#oq-272), ruled under [R-072](../requests.md#r-072)):
REQ-LIBRARY-133 joins the Extends line with its back-pointer, and REQ-LIBRARY-132's back-pointer names revision 2.
REQ-LIBRARY-094, REQ-LIBRARY-095, REQ-LIBRARY-092 and REQ-SESSION-115 keep their text and their notes.*

*Raised under the owner's delegation, 2026-10-07; logged as [R-072](../requests.md#r-072), the ruling of OQ-210, which weighed
advocate A's change of behaviour and advocate B's confirmation as built and followed both.*
Revision 2 logged as [R-072](../requests.md#r-072) (OQ-272), ruled by the consortium under the owner's delegation on 2026-10-13:
the frontmatter shown read-only, and a save writing the record's frontmatter.

> **First execution, 2026-10-07 (bundle `fin28-artifacts`).** Clause (d) found a defect, the one the ruling named: a re-render
> wrote the whole rendering over an edited document
> ([the note](../../defects/fixed/a-re-render-writes-over-a-persons-saved-artifact-edit.md)). `ArtifactStore.rerender`
> (`packages/engine/src/artifacts/store.ts`) now rewrites only the frontmatter (`renderFrontmatter`, `splitFrontmatter` in
> `packages/contracts/src/artifacts.ts`); `latestArtifactText` (`packages/engine/src/sessions.ts`) carries an edited document
> marked `edited`; `renderSidecar`'s Key Findings section drops only blank lines; the inspector's Preview starts below the
> frontmatter (`previewSource`). Clauses (a), (b) and (c) held as built. **What was measured.** Nine cases in
> `artifacts/artifacts.test.ts` (seven red on the code before), one in `session-resume.test.ts` (red before), the block
> definition in `contracts/src/artifacts.test.ts` and the Preview's source in `library/ArtifactInspector.test.ts`;
> `pnpm artifacts-proof`'s launch 4 asserts the Preview renders no frontmatter line, and passed (its inspector opened at the
> artifact's title). The built-app evidence for the Preview is `pnpm artifacts-proof`'s, its probe and its screenshots,
> where the plan had named `pnpm app:drive`, which was not run (corrected by fin30, 2026-10-07, which added launch 4's
> `inspector-preview.png`, taken while the Preview tab is shown: the launch's closing screenshot shows the Markdown tab and
> the saved edit; the fin30 run shows the dialog's Preview opening at "The scripted plan", no frontmatter line drawn).
> **What was not measured.** No built-app launch edits an artifact and then supersedes or re-reports it:
> that survival is measured on the real store on disk by the unit tests. The orchestrator's live run should show unedited
> artifacts read as before. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **First live execution, 2026-10-07 (the final default live run at `a68f121`, pack `2026-10-07T06-48-50-123Z`):** what the
> paragraph above asked of the orchestrator's live run held. In the terminal session, iteration 2's fresh root read the child
> report `art_KKd3l5TA` with `artifact_read` (tool call `#24`), and it returned the document clause (a) makes the body: its
> frontmatter, title, Summary, Key Findings and Commands. Found nothing against the directive. **Not reached:** an edited
> artifact (clauses (c) to (e)) and the Key Findings section's indentation case; no person edited an artifact in the pack.
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Clauses (c) to (e) in the built app, 2026-10-13 (fin42, item N57).** "No built-app launch edits an artifact and then
> supersedes or re-reports it" no longer holds. `pnpm artifacts-proof`'s launch 8 (`edited`) publishes `travel-plan` and a person
> edits and saves it in the Markdown tab: `edited_at` was stamped and `key_findings` kept the published body (c). Launch 9
> (`re-reported`) continues that session: the fresh root's first message carried `Artifact: <id> — Travel plan (agent_published,
> published, edited)` with the person's text and no frontmatter line (e), and its publish of `travel-plan-2` with `supersedes:
> travel-plan` rewrote the older document's frontmatter (`superseded_by`) and kept the person's text below it (d). **Found by
> building:** the first build of launch 8 typed where its click put the caret, the editor's centre, which is inside the
> frontmatter; the save stamped `edited_at` and the table showed ` · edited`, and launch 9's re-render rewrote the block, so the
> edit was gone while the handoff still named the artifact `edited`. That is clause (d) as written, and a cost the paragraph
> above does not name; raised as [OQ-272](../../architecture/open-questions/57-spikes-and-later-questions-24.md#oq-272), not decided. The proofs now take the caret
> below the frontmatter first. A person's edit live is asked by the default live run's `delegation-edit` launch, the
> orchestrator's to run. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 2, 2026-10-14 (fin43, `fin43-analysis-and-artifacts`), ruled by [R-072](../requests.md#r-072)
> (OQ-272):** clauses (c) and (f) held as written. `ArtifactStore.editBody` (`packages/engine/src/artifacts/store.ts`) writes
> through `withRecordFrontmatter`, the rule `rerender` already used, with the record's new `edited_at`; `ArtifactInspector`
> (`packages/ui/src/library/ArtifactInspector.tsx`) holds the block apart (`inspectorDocument`), draws it read-only above the
> editor as "Record fields (read-only)" (`artifact-frontmatter`, a `<pre>` bounded to 30 % of the body with its own scroll,
> `--rt-font-mono`, `--rt-text-secondary`, `--rt-divider`, `--rt-surface-2`), previews and edits the text below it, sends
> `savedDocument(block, text)`, and refreshes the block from the saved document after a save. **What was measured.** Three
> cases in `artifacts/artifacts.test.ts` (a block with a changed title, a broken block, no block; each red on the code before,
> each surviving a supersession) and two existing ones restated for the block a save now writes; five cases in
> `library/ArtifactInspector.test.ts` (four red before). `pnpm artifacts-proof`, every launch green at a load average of 0.9 to
> 2.6 on four CPUs: launch 8 dropped its `Ctrl+End` chord, pressed the read-only block and typed there (focus stayed on the
> `<pre>`, the dialog stayed clean, nothing reached the document), pressed the editor's centre — now below the block (block
> 686×118 at y 510, editor 686×266 at y 636, in a 720×560 dialog) — and typed; the saved document's block carried the record's
> `id`, `slug`, `title`, `status`, `created_at` and `edited_at`, the typed text sat below it, and the shown block was refreshed
> with `edited_at`. Launch 9 read the handoff carry the person's text marked `edited` and the superseding publish keep it below a
> rewritten block that still carries `edited_at`. **What was not measured.** A live run (`delegation-edit`, the orchestrator's);
> a document whose block an earlier edit broke, in the built app (the unit cases carry it). **Found along the way:** the editor is
> drawn in the body's face, not the monospace one REQ-LIBRARY-132 asks for, because the adopted `textarea.input` rule outranks
> the inspector's class
> ([`the-artifact-inspectors-markdown-editor-is-not-drawn-in-the-monospace-face`](../../defects/fixed/the-artifact-inspectors-markdown-editor-is-not-drawn-in-the-monospace-face.md),
> recorded, not repaired; repaired 2026-10-14 by fin44). The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
