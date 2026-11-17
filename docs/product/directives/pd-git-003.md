[Product directives](../directives.md) › PD-GIT-003

<a id="pd-git-003"></a>

### PD-GIT-003 — the checkpoint picker names a session by its label

An entry of the Git view's checkpoint session picker MUST be labelled `<label> · <branch>` when the session has a branch, else `<label>`, where `<label>` is the session's label as the session list gives it (REQ-MONITOR-171's row, the sidebar's, the session browser's). A session with no label — an empty one — is labelled by its identifier, as before. The entry's tooltip is the session's identifier. Every other clause of REQ-GIT-086 stands as written: the picker's accessible name, its minimum width, the "Restore checkpoint" button, the table, its columns, its selection and its order; and REQ-GIT-088's choice of the effective session is untouched, since an entry's value is still the identifier.

**Why, and what it costs.** Finding C-14 of [the shell's brief](../../design/briefs/shell.md), from an independent critique of the built application: every other list of sessions in the product names a session by its label — the first words of what was asked — and this one named it by a UUID, so an operator choosing which session's checkpoints to read had to carry an identifier from another screen. The branch a session created holds its identifier (`rotaris/session/<id>`), so an isolated session's entry still shows it; a session that is not isolated shows it in the tooltip. The cost: two sessions started with the same words read alike in the picker where their identifiers told them apart; their branches differ where they have one, and the tooltip differs always. The alternative weighed was to show both, label and identifier, which at the picker's 220 px elides the label that is the point.

> **Narrows:** REQ-GIT-086

Its case is the text of a picker entry alone.

*Proposed and decided by the model (`claude-fable-5-2`) under the owner's standing delegation [R-098](../requests.md#r-098) and the request [R-102](../requests.md#r-102), 2026-11-17. The owner did not word this directive.*
