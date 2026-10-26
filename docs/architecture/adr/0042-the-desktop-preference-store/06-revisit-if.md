# ADR-0042 — The desktop preference store stays a closed typed registry over an explicitly rooted per-user file — Revisit if

Part 6 of 9 of [ADR-0042](../0042-the-desktop-preference-store.md), which indexes every part.

## Revisit if

A requirement makes the store's physical form observable; `REQ-SHELL-006` currently says the opposite.
Or the key set ceases to be closed. Or `REQ-CHAT-045`'s byte-exact prompt-history format is withdrawn,
which is the only change that would make that one file a candidate for the workspace database.

**Second execution — 2026-09-05, the first pane layout (Part M).** `panels/overview` joins the closed registry as
REQ-SHELL-069 fixes it: a record with `version: 1`, the view's pane count (2) and one size per pane; anything else —
another version, another count, a malformed size — reads as nothing stored and the declared defaults apply
(340 px right, 260..560, the left column at least 320). Written through `prefs.set` from the view's divider (pointer
drag, or Left/Right/Home/End on the focused separator), read at boot beside the theme and the motion preference.
`pnpm overview-proof` writes a layout and reads it back on a relaunch. **Found — the eighteenth first-execution defect:** the
store's serialiser handed `JSON.stringify` the sorted key list as its replacer, and a replacer ARRAY filters every level,
not the top one — so the first nested value ever stored (this layout) was written as `{}` and read back as nothing
stored. Every earlier preference was a string or a boolean and could not show it. The top-level order is now built
before serialising; the falsified reading is kept beside the line.

**Third execution — 2026-09-05, the Git view's split (Part O).** `panels/git` joins the registry under REQ-SHELL-069's
key for the fifth view and REQ-GIT-153's rule that the domain mints no key of its own: the same record shape, pane
count 2, declared default 480 px right with both columns at least 280 (REQ-GIT-076). Written from the view's G8
divider, read at boot beside `panels/overview`. `pnpm git-proof` drags the divider by keyboard (three Left presses,
16 px each) in its first launch, checks the file holds `[…, 528]`, and reads it back on the fifth. **Found: nothing** —
the corrected serialiser round-trips the second nested record exactly as it did the first.

**Fourth execution — 2026-09-07, the Library's split, and the prompt file falsified (Part X).** `panels/library`
joins the registry under REQ-SHELL-069's key rule for the sixth view: the lower-cased view name with **no**
`{view}.{arrangement}` suffix, because that form is for "a view carrying more than one independent multi-pane
arrangement" and the Library carries one — the Prompts tab's stash/history split (REQ-LIBRARY-106), the other two
tabs declaring no divider. Same record shape, pane count 2, declared default 480 px left with both columns at
least 240 px. Written from the tab's divider (pointer drag, or Left/Right/Home on the focused separator), read at
boot beside `panels/overview` and `panels/git`. **Found: nothing** — the third nested record round-trips exactly
as the first two did, and the key rule needed no interpretation beyond reading its own second sentence.

**Fifth execution — 2026-09-07, the composer's draft and the Workspace divider (Part AB).** Two entries join the
registry, and one of them is a **kind** of entry the table did not have.

`panels/workspace` is the ordinary half: REQ-CHAT-010's transcript/composer divider, keyed by the lower-cased view
name under REQ-SHELL-069's rule with no `{view}.{arrangement}` suffix — the same reading Part X took for the
Library, for the same reason (the Workspace carries one multi-pane arrangement). Pane count 2, sizes
`[transcript, composer]`, the declared defaults REQ-CHAT-010's own figures (composer 150 px, never below 110 px;
transcript never below 180 px). Written from the divider (pointer drag, or Up/Down/Home/End on the focused
separator), read at boot beside the other three. **Found: nothing** — the fourth nested record round-trips exactly
as the first three did.

**The composer draft is the first PARAMETRISED row of a table whose whole point is that it is closed**, and that
tension is worth stating rather than resolving quietly. `REQ-SHELL-159` registers `workspaces/{workspace-key}/
composerDraft`, default the empty string; `REQ-SHELL-006` says "a key that does not appear in that table does not
exist", and the decision above makes reading an unregistered key a **compile error**. A literal-keyed object
cannot express a key parametrised by the open workspace, and a `Record<string, …>` would give up the closure. The
resolution: the **family** is what is registered, `composerDraftKey(workspacePath)` is the only way to mint a
member, and `preferenceEntry` refuses at runtime any key that is neither in the literal table nor a member of the
family — so the closure survives in both forms, compile-time for a literal and runtime for a family. The
workspace key is a 16-hex digest of `pathKey` (W-27's identity spelling, case-folded on Windows) because a
workspace path carries separators and a colon and a slash-namespaced key cannot hold one; the digest is a function
of the path, which is what "keyed by workspace path" asks for, and two spellings of one workspace cannot split a
draft in two.

The two debounces of consequence 5 are both implemented and both measured: 200 ms to application state
(`REQ-CHAT-014`) and 400 ms to this store (`REQ-SHELL-159`), **measured from the same keystroke and not chained**,
with focus loss, submit, stash and the view's unmount as flush points. `pnpm composer-proof` writes a draft
carrying punctuation, a newline, a double space, a trailing space and a non-ASCII character through the composer's
own change path, relaunches, and reads it back **character for character** — then opens a second workspace against
the same preference root and finds its composer empty and the first draft untouched.

**Found — nothing this store did wrong, and one thing the seam above it would have.** The draft never travels as a
preference key on the command channel: `prefs.get`/`prefs.set` take a key from a closed enum, and adding the draft
family there would have let a renderer name **another workspace's** key, which is exactly what REQ-CHAT-015's last
sentence forbids. Two commands carrying no key at all (`composer.readDraft` / `composer.writeDraft`) were added
instead, and main derives the key from the workspace it has open. The isolation is then a property of the seam
rather than of every caller being careful — which is the same argument this ADR makes for the registry itself.

**The falsified reading kept beside its replacement.** The Context section above, and the Decision's last bullet,
record that "prompt history and stash are **not in this store** — they are per workspace, at
`<workspace>/.rotaris/rotaris-prompts.json`, in the byte-exact format `REQ-CHAT-045` fixes", and the *Revisit if*
clause names the withdrawal of that byte format as the one change that would reopen the question. **That
withdrawal has happened.** `REQ-CHAT-045` now reads "Where they are held is REQ-LIBRARY-138's and is not fixed
here: no path, no file name and no document format is contractual, and this requirement states none", and
`REQ-SHELL-157` says the same; `REQ-LIBRARY-138` names **the workspace's durable store**, and adds a sentence the
file form could not have met — "persisting one entry MUST NOT require rewriting the others". Part X therefore
writes both lists as **rows** in the workspace database at schema v11, one row per entry (`schema.ts` carries the
same note). The reasoning above is not deleted: it was correct while the byte format stood, it named exactly the
condition under which it would fall, and that condition is what fell. What survives unchanged is the *reason for
the separation* — a prompt is per workspace and a preference is per user, so the two never meet — and the
consequence 7 guard still holds: no preference key has a row type in any schema, and neither prompt table is a
preference key.
