---
reference: ROTARIS-CRW-001
domain: model-providers-auth
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 04, Model Providers, Sign-In, and Model Routing


> ## Amendment, 2026-09-29 — the money rule's floor (ESC-42)
>
> `REQ-PROVIDER-121` gains one sentence: an amount that is not a balance, is greater than zero, and that the rule's
> rounding would render as zero renders as `< 0.0001`, with the currency's symbol or code placed as the rule places it.
> Zero renders `0.00`; a balance, rounded down, and a negative amount are never floored. The rendering-formats line below
> carries the floor with it. The floor is rendering only: every amount is still computed, stored and summed exactly.
>
> **Why this is an amendment and not a directive.** `REQ-SHELL-045` (domain 12) cites this rule "so a cost that is small
> but not nothing is never rendered as zero", and the rule as written rendered every such cost below 0.00005 as `0.0000`.
> Two live requirements disagreed about what the one money rule achieves. The owner ruled ESC-42 option (b) as it
> recommended ([R-067](../../product/requests.md#r-067)); `owner-decisions.md` holds the ruling.


> ## Amendment, 2026-09-23 — per-token prices are decimal strings (OQ-21)
>
> `REQ-PROVIDER-072` now carries `concrete-cloud`'s decimal-string prices as decimal strings rather than
> mapping them to floating point, and rejects a malformed value where it rejected a non-finite one. The
> discovery snapshot's `pricing` block types `input_cost_per_token` and `output_cost_per_token` as decimal
> strings, beside `image_cost_per_image`, which already was one.
>
> **Why this is an amendment and not a directive.** Two live requirements disagreed: `REQ-PROVIDER-072` and
> the snapshot format typed prices as floats, while `REQ-PROVIDER-121` forbids computing any amount, "including
> the per-token pricing carried through discovery", in binary floating point. A value that has been through a
> binary float cannot afterwards be made exact, so the float typing was the defect. The owner ruled OQ-21 as it
> recommended ([R-049](../../product/requests.md#r-049)); `owner-decisions.md` holds the ruling.


> ## Amendment, 2026-09-02 — the Copilot gateway staging directory leaves the workspace
>
> **Row 14 below is superseded.** It settled the staging directory as
> `<workspace root>/.rotaris/copilot-gateway/`. REQ-PROVIDER-063 now places it under the **per-user data
> directory**, beside the credential store rather than inside it (REQ-PROVIDER-014, REQ-PROVIDER-018),
> with one directory per workspace named by the workspace's stable identifier and never by its path
> (REQ-SESSION-197), located the way REQ-SESSION-198 locates the durable session store.
>
> **Why.** The two staged files are bearer tokens. ESC-15 and SR-4 moved the session store out of the
> workspace precisely so that nothing the product owns sits where a file-synchronising client reaches it,
> and that reasoning reaches credentials at least as strongly. What bounded these files while they were
> in the workspace — REQ-CONFIG-013's ignore rule, REQ-PROVIDER-016's protection, and short token
> lifetimes — bounds version control and local access, and none of it bounds replication to a
> synchronisation vendor's servers. This is an extension of a ruling the owner already made, not a new
> decision.
>
> **Why this is a fix and not an escalation.** ADR-0004 consequence 8 records that the path "cannot be
> relocated to per-user storage the way the session store was, because consumers are pointed at the
> directory by `GITHUB_COPILOT_TOKEN_DIR` and the name is stated to be part of the observable contract."
> That inference runs backwards. Being pointed at a directory *by a variable the product sets* is exactly
> what makes the location free: the variable carries whatever path this specification fixes. What is a
> third-party contract is the **variable name**, the two **file names** `access-token` and `api-key.json`,
> and the **content of `api-key.json`** — and every one of those is unchanged, character for character.
> REQ-PROVIDER-063 now says the directory's own name is not a contract with any consumer, in place of the
> sentence that said it was.
>
> **Everything else in REQ-PROVIDER-063 is unchanged**: the protection (POSIX `0700` on the directory and
> `0600` on both files, the explicit Windows access control list, staging refused outright when the
> protection cannot be applied), the all-or-nothing write, the on-disk-before-success rule, both file
> shapes, and the `https://api.githubcopilot.com` default for `endpoints.api`. REQ-PROVIDER-064 keeps the
> `managed-by-rotaris` sentinel and the per-workspace pinning it already required; REQ-PROVIDER-061 and
> REQ-PROVIDER-092 are re-pointed. Row 3 below is unaffected — the product's obligation still ends at
> publishing the files and the variables.
>
> **One clause added on the fix's own premise.** REQ-PROVIDER-063 and REQ-PROVIDER-014 now both require
> the per-user data directory they resolve to be storage **local to the machine** and not storage
> replicated to another machine or profile, on the terms REQ-SESSION-198 already fixes for the durable
> session store. Without it the move is hollow: a per-user data directory that is itself replicated
> reaches a vendor's servers exactly as `.rotaris/` did. This matters concretely, because the
> architecture record reports that on Windows one requirement's "platform-conventional data directory"
> resolves under the **roaming** profile while another's "storage local to that machine" does not
> (REQ-STARTUP-145 against REQ-STARTUP-166) — a domain 11 question this pass does not own but whose
> answer these two requirements now depend on.
>
> **Carried to other documents, not made here.** ADR-0004's table row and consequence 8, ADR-0029 and
> `proposals/model.md` all still place the directory in the workspace; domain 15's REQ-CONFIG-010 and
> workspace-layout block have been amended, since that domain is the other one this pass owns.

This record disposes of every open question raised in the draft of
[`../04-model-providers-auth.md`](../04-model-providers-auth.md) (domain 04, requirement prefix
`REQ-PROVIDER`). The body of that specification has been amended so that each decision below is
stated normatively in place; the numbering of the original open questions is preserved here so the
draft and the resolved specification can be read against each other.

The product-owner decisions of 2026-08-30 that governed the dispositions:

1. **Compatibility ambition is behavioral inspiration only.** No obligation to match any other
   implementation's formats, surface, exit codes, or event vocabulary. Under-determined cases are
   decided here on their merits, never preserved for compatibility.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   more coherent with the rest of the document; where no coherent reading exists, the behavior is
   narrowed or withdrawn rather than reproduced.
3. **Unbuilt-but-intended behavior stays in scope.** A requirement is not dropped merely because it
   describes intent.
4. **The product is one Electron desktop application.** It has no command-line interface and no
   terminal user interface — removed, not deferred. Domains 17 and 18 are retired and the `REQ-TUI`
   and `REQ-CLI` identifiers are withdrawn, so no requirement here cites them. What is emphatically
   *not* removed is this domain's subject matter: device-code and browser sign-in flows, the local
   loopback callback listener, credential bridge files staged for programs the application runs, the
   environment the application hands to a child process, and the external subscription runtime all
   remain fully in scope, because they are things the application does, not ways a user drives the
   application. What is removed is every way a *user* reached provider sign-in, provider management,
   catalogue refresh, or model selection from a shell or a text-mode screen.
5. **Message text states required information content, not exact wording**, except where a string is
   part of a machine-readable contract (an event field value, an enum, a parseable output format).
6. **No legacy-directory or legacy-identifier adoption.** A clean-room product has no earlier
   installation, directory, provider id, or token format to migrate from.

Cross-domain vocabulary was taken from `03-conversation-composer-transcript.md` (the image-attachment
gate, REQ-CHAT-171, and attachment token estimation, REQ-CHAT-174) and `12-desktop-shell-windows.md`
(the one vocabulary of named actions, REQ-SHELL-048; state never conveyed by colour alone,
REQ-SHELL-149; reachable and labelled at the minimum window size, REQ-SHELL-022). Those five are the
only cross-domain identifiers the amended specification cites, and no `REQ-TUI-*` or `REQ-CLI-*`
identifier appears anywhere in it. No other specification was consulted, and no identifier, name, or
phrasing was taken from any other implementation.

New requirements added by this pass: **REQ-PROVIDER-140** through **REQ-PROVIDER-152**. No
requirement identifier was renumbered, reused, or deleted. Of the 29 open questions raised in the
draft, 27 are resolved, 1 is omitted, 1 is moot, and none is escalated.

## Parts

Since 2026-10-26 the rest of this document is in [`04-model-providers-auth/`](04-model-providers-auth/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](04-model-providers-auth/01-graphical-only-sweep.md) | Graphical-only sweep |
| [02](04-model-providers-auth/02-required-addition-image-input.md) | Required addition — image input |
| [03](04-model-providers-auth/03-open-question-dispositions.md) | Open-question dispositions |
