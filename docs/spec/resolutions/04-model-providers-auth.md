---
reference: ROTARIS-CRW-001
domain: model-providers-auth
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 04, Model Providers, Sign-In, and Model Routing


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

## Graphical-only sweep

The draft carried three sections written entirely around a shell or text-mode surface — "CLI:
Sign-In Command", "CLI: Sign-Out, Provider Management, Catalog Refresh", and "Terminal-UI Surfaces"
— plus a scatter of shell clauses inside otherwise in-scope requirements. Every capability those
surfaces carried was rescued into the desktop before the surface was withdrawn; nothing a user could
do was lost. Section headings were retitled to match ("Provider Sign-In Flow", "Sign-Out, Provider
Management, Catalog Refresh", "Retired Terminal-UI Surfaces").

| Withdrawn shell/text-mode requirement | What it carried | Capability now carried by |
| --- | --- | --- |
| REQ-PROVIDER-042 | Coming-soon gating of the hosted provider in the sign-in menu | REQ-PROVIDER-142 (provider chooser), REQ-PROVIDER-043 (desktop health check and add-provider dialog) |
| REQ-PROVIDER-056 | `providers delete` with a confirmation flag and exit codes | REQ-PROVIDER-141 (provider settings, delete with confirmation) |
| REQ-PROVIDER-093 | `login [PROVIDER] [--reauth] [-w PATH]`, exit codes | REQ-PROVIDER-142 (sign-in and re-authentication actions, workspace scope) |
| REQ-PROVIDER-094 | Provider menu, label adjustments, arrow-key selector | REQ-PROVIDER-142 (provider chooser, catalog order, label rules, cancellation) |
| REQ-PROVIDER-101 | `logout [PROVIDER]`, `run --logout`, interactive selector, exit codes | REQ-PROVIDER-143 (sign-out action and its provider list) |
| REQ-PROVIDER-103 | `providers list` printed lines and the provider-set union rule | REQ-PROVIDER-140 (provider list view) |
| REQ-PROVIDER-104 | `providers set-key` | REQ-PROVIDER-141 (API-key field, validated save) |
| REQ-PROVIDER-105 | `providers set-base-url` | REQ-PROVIDER-141 (base-URL field, re-discovery on change) |
| REQ-PROVIDER-106 | `providers validate` / `reauth` / `delete` aliases | REQ-PROVIDER-141 (validate, re-authenticate, delete actions) |
| REQ-PROVIDER-109 | `models refresh [--provider ID]`, progress and summary text, exit code | REQ-PROVIDER-147 (catalogue refresh action, per-provider and bulk) |
| REQ-PROVIDER-111 | Terminal Provider Settings modal | REQ-PROVIDER-141 (desktop provider settings) |
| REQ-PROVIDER-112 | Terminal Startup Models modal (Ctrl+P) | REQ-PROVIDER-144 (startup model assignment editor) |
| REQ-PROVIDER-113 | Terminal rich model picker sub-screen | REQ-PROVIDER-145 (model picker) |
| REQ-PROVIDER-114 | Terminal Runtime Models modal (Ctrl+M) | REQ-PROVIDER-146 (runtime model override selection) |
| REQ-PROVIDER-115 | Terminal slash commands `/logout`, `/model` | REQ-PROVIDER-143 (sign-out action), REQ-PROVIDER-146 (composer `/model`) |
| REQ-PROVIDER-138 | `run --logout` short-circuit | REQ-PROVIDER-143 (sign-out is its own action and never carries a task) |
| REQ-PROVIDER-139 | Exit-code contract for every subcommand | Nothing to rescue: the product exposes no process exit status to a user. Outcome reporting is REQ-PROVIDER-142, REQ-PROVIDER-143, REQ-PROVIDER-147 |
| REQ-PROVIDER-015 | Legacy directory adoption | Withdrawn under binding decision B; no capability, a clean-room product has no earlier directory |

Shell-surface clauses struck from requirements that otherwise survive: REQ-PROVIDER-013 (stdout and
stderr as diagnostic venues), REQ-PROVIDER-035 (`rotaris-cli login codex --reauth` in a user
message), REQ-PROVIDER-039 ("return to the terminal" in the callback success page),
REQ-PROVIDER-044 / REQ-PROVIDER-046 / REQ-PROVIDER-050 / REQ-PROVIDER-052 (command names inside
sign-in instructions and error messages), REQ-PROVIDER-095 / REQ-PROVIDER-096 / REQ-PROVIDER-097 /
REQ-PROVIDER-099 / REQ-PROVIDER-100 (the sign-in sequence, rewritten as the
desktop flow it now is), REQ-PROVIDER-102 (exit codes), REQ-PROVIDER-110 ("both CLI frontends"),
REQ-PROVIDER-118 (its citation of CLI sign-out). Legacy-identifier clauses struck under decision 6:
REQ-PROVIDER-009 and REQ-PROVIDER-041 (the `geraet-cloud` alias), REQ-PROVIDER-024 and
REQ-PROVIDER-025 ("from earlier builds"), REQ-PROVIDER-089 (legacy thinking booleans),
REQ-PROVIDER-128 ("credentials from before the field existed").

One further clause was struck for a different reason: REQ-PROVIDER-037 took the hosted-cloud issuer
and API base from environment variables alone, which a desktop application launched from a desktop
launcher cannot rely on. Under the configuration-surface split, both are now configuration values on
the layered YAML surface, with the environment variables retained as an override where they happen
to be present.

## Required addition — image input

The conversation domain gates image attachments on a declaration this domain owns (REQ-CHAT-171) and
prices them on a cost this domain owns (REQ-CHAT-174). Both are now stated here.

- **REQ-PROVIDER-149** gives every model entry an `accepts_image_input` boolean in its capabilities
  object, populated from three sources with a stated precedence — an explicit YAML declaration
  first, then the provider's own report from the most recent successful discovery (codex input
  modalities, or a generic provider's capabilities object), then the shipped model-capability
  metadata. A later discovery replaces a discovered or metadata-derived value and never overrides an
  explicit YAML declaration. **A model that declares nothing does not announce image input**: absent
  is read everywhere as closed, so the REQ-CHAT-171 gate fails closed and a model with no
  declaration is presented exactly like one declaring false. The declaration is observable wherever
  models are listed or selected — the provider list, the assignment editor, the model picker, and
  runtime override selection — as one labelled indicator, never colour alone (REQ-SHELL-149). It is
  never inferred from a model's name.
- **REQ-PROVIDER-150** adds an optional image token cost — a fixed `image_input_tokens` count, an
  `image_input_tokens_per_megapixel` rate, or both — populated by the same sources under the same
  precedence. The estimator prefers the rate when the image's dimensions are readable, else the
  fixed count. **Where neither is available the cost is unknown**: the estimator must not guess and
  must not count zero, but treats the attachment as an unknown non-zero amount and marks the whole
  estimate a lower bound, exactly as REQ-CHAT-174 requires.
- Money: estimated image tokens are ordinary input tokens priced with `input_cost_per_token`, and
  where a provider prices per image instead, that price is a decimal string in the entry's pricing
  block. Either way every amount is computed and rendered under **REQ-PROVIDER-121**, which has been
  amended to say in terms that it is the one money rule for this domain and that it covers the
  per-token pricing carried through discovery and any image pricing REQ-PROVIDER-150 introduces. No
  amount is computed in binary floating point anywhere.

## Open-question dispositions

| OQ # | Disposition | Decision taken | Requirements touched |
| --- | --- | --- | --- |
| 1 | RESOLVED | Remote payload shapes are contracts the product *consumes*, not promises a provider makes. Unknown fields are accepted and ignored; a missing required value fails only that read, with the owning requirement's error, and is never repaired by guessing; no remote read fails a run, deletes a credential, or changes a catalog attribute unless a requirement says so. Following a provider's payload change costs build mapping data and no behavior stated here. | REQ-PROVIDER-151 (new) |
| 2 | RESOLVED | The loopback callback ports are a build-declared ordered list, tried in order, because the redirect URI must already be one the identity service accepts and a dynamically assigned port therefore cannot be used. The build ships `1455, 1457` for codex; no port outside the list is ever bound; every port busy fails with an error naming the ports it tried. Revising the list is build data, not a change of behavior. | REQ-PROVIDER-029 |
| 3 | RESOLVED | The product's obligation ends at publishing the staged files atomically and setting the two environment variables. It never probes, verifies, or waits on the consumer, and never asserts that the consumer honored the contract; a consumer that ignores them surfaces as an authentication failure on the next model call, not as a staging error. | REQ-PROVIDER-064, REQ-PROVIDER-151 |
| 4 | RESOLVED | Protection is applied explicitly on every platform instead of inherited. POSIX keeps `0700`/`0600`; on Windows the credential directory and every file in it are created with an explicit access control list granting the owning user account and the local system account only, with inheritance disabled. A credential whose protection cannot be applied is not written at all, and the failure names the store path. The same rule governs the Copilot staging directory. | REQ-PROVIDER-016, REQ-PROVIDER-063 |
| 5 | RESOLVED — **rationale corrected under SR-1** | Atomic per-file writes stay, and every read-modify-write over a credential file or the snapshot additionally takes an exclusive lock on a lock file adjacent to the target, so overlapping sequences serialize instead of interleaving and neither silently loses the other's change. A lock unobtainable within 5 seconds fails the operation, conveying that the store is being updated and that the action can be retried; stale locks are reclaimed, live ones never broken; reads take no lock. *The decision is unchanged; its subject is.* It was argued here from "two instances serialize instead of interleaving" and fixed a message stating "that another instance is updating the store". Only one instance of the application runs (REQ-STARTUP-161), so the sequences the lock serializes are those of the windows and runs *inside* that instance, plus the two non-routine states in which a second process can touch these files at all: a lock left by an instance that crashed, and the brief overlap of an in-place update hand-over (REQ-STARTUP-121). The message is now stated as what it must convey and must not assert a second instance. | REQ-PROVIDER-152 (new), REQ-STARTUP-161 |
| 6 | RESOLVED | Precedence is fixed here even though run orchestration applies it: while a session model override is set it outranks both the active model and the persistent slot value for every call it covers; clearing it restores the persistent value and does nothing else; it is never written to `.rotaris/agents.yaml`, never merged into the snapshot, and never outlives the session that set it. | REQ-PROVIDER-122, REQ-PROVIDER-146 |
| 7 | MOOT | The question was only ever about the raw-mode terminal selector, which no longer exists. Job 1 withdrew REQ-PROVIDER-094 (the arrow-key provider menu and its numbered fallback) together with the terminal modals REQ-PROVIDER-111 to REQ-PROVIDER-115; the desktop provider chooser that replaces it has no terminal behavior left to be uncertain about. | REQ-PROVIDER-094 (withdrawn), REQ-PROVIDER-111 to REQ-PROVIDER-115 (withdrawn), REQ-PROVIDER-142 |
| 8 | RESOLVED | Not a specification gap: automatic tier assignment is now total and deterministic for any catalog whatsoever — the preference lists are build data, ties break on the lowest qualified id in code-point order, and a slot with no pick at all takes the lowest qualified id among available models. What a real account discovers can therefore change the inputs but never the specified behavior. | REQ-PROVIDER-081, REQ-PROVIDER-082 |
| 9 | RESOLVED | The coming-soon marking is a build attribute and only that. Nothing in the running product writes the availability attribute: no health check, remote flag, configuration value, or user action flips it, and it changes only when a later build ships the entry marked available. | REQ-PROVIDER-006 |
| 10 | RESOLVED | No sentinel string is part of the contract, because there is no string. A `local-sdk` entry declares neither a discovery URL nor a default base URL; catalog integrity rejects a build that gives it either; asking the entry for one yields nothing, and a code path that requires one fails before opening any connection rather than falling back to another entry's value. | REQ-PROVIDER-002, REQ-PROVIDER-003, REQ-PROVIDER-005 |
| 11 | RESOLVED | The reported failure must convey that the attempt did not reach an outcome within the 30-second limit, which provider it was for, and that nothing was stored so a retry is safe. Exact wording is left to the implementation; the venue clause naming stdout and stderr was struck in job 1. | REQ-PROVIDER-013 |
| 12 | RESOLVED | The absence of a scope check is the intended contract. Granted scopes never affect status classification and no request is refused locally on scope grounds, because only the provider knows what a grant permits; a provider that refuses for want of a scope surfaces its own refusal, and a refusal carrying HTTP 401 or 403 takes the existing credential-hygiene path. | REQ-PROVIDER-034, REQ-PROVIDER-098 |
| 13 | RESOLVED | One trigger and one lifetime. The exchange runs on demand immediately before a request for a configured model that names `codex` as its sign-in provider and is dispatched against an API-key-style endpoint, and nowhere else. The derived `sk-` key lives in process memory for the lifetime of the process only, is never written to the credential store, the snapshot, a log, an event, or any file, and is re-derived when rejected or after a restart; a failed exchange fails that one model call and never invalidates the stored codex credential. The organization-missing message now directs the user to re-authenticate Codex from provider settings instead of naming a command. | REQ-PROVIDER-035, REQ-PROVIDER-141 |
| 14 | RESOLVED — **location superseded 2026-09-02, see the amendment block at the head of this record** | The staging directory is `<workspace root>/.rotaris/copilot-gateway/`, and that name is part of the observable contract because consumers reach it through `GITHUB_COPILOT_TOKEN_DIR`. It carries the credential-store protection (POSIX `0700`, or an explicit Windows ACL), and both `access-token` and `api-key.json` carry POSIX `0600` or the equivalent ACL; staging fails without writing either file when that protection cannot be applied. | REQ-PROVIDER-063, Data & Formats |
| 15 | RESOLVED | The mapping is made total. Every non-2xx status not already named — 404, 408, 429, and every other 4xx — fails discovery reporting that status and conveying a refusal for a reason other than authentication, and for HTTP 429 additionally that the refusal was a rate limit the read can retry later. No response is left unclassified and no unmapped status is silently treated as success. | REQ-PROVIDER-071 |
| 16 | RESOLVED | The three key paths are build data, declared once in the build's Copilot catalog-payload mapping and applied to every entry. This specification fixes the behavior for each value found, not the path it is found at, so a build that follows a payload change changes no behavior; an entry carrying nothing at a declared path counts as omitting that field and is treated as available. | REQ-PROVIDER-073, REQ-PROVIDER-151 |
| 17 | RESOLVED | The per-model rows are build data, revised without a specification change. What is normative: every key has the form `provider/model` or `provider/`; every value is a pair of positive integers; the `deepseek/` row ships with (1,048,576, 384,000); the table is consulted only through the stated lookup; and a table with no matching row leaves those limits unknown rather than failing anything. | REQ-PROVIDER-079, REQ-PROVIDER-080 |
| 18 | RESOLVED | Only the invariants and determinism are normative; the ordered preference lists and the secondary fallback list are build data. A tie among several models matching at the same preference rank is broken by taking the lowest qualified id in ascending code-point order, so one catalog always yields the same three picks whatever order discovery returned it in. | REQ-PROVIDER-081 |
| 19 | RESOLVED | The last-resort choice is the available model with the lowest qualified id in ascending code-point order. It is defined for every catalog, is the same model for every slot that needs it, and is independent both of discovery order and of the snapshot's stored ordering. | REQ-PROVIDER-082 |
| 20 | RESOLVED | `auto` is removed from the vocabulary: it was indistinguishable from unset in every stored value and every display, so keeping it would have preserved an arbitrary distinction. `<slot>_thinking` accepts exactly `low`, `medium`, `high`, `max`; leaving it unset is the one way to say the provider or endpoint decides; any other value, `auto` included, is rejected with a message naming the field and the accepted levels. | REQ-PROVIDER-088, REQ-PROVIDER-137, REQ-PROVIDER-144 |
| 21 | RESOLVED | An alias whose slot has no value never fails the load. It resolves to `fallback_model` when that slot has a value, and otherwise leaves the naming field unset and records a configuration validation warning naming the persona or section and the empty slot, so the gap is visible before a run is started rather than at dispatch. The picker continues to show such an alias as unconfigured. | REQ-PROVIDER-088, REQ-PROVIDER-144, REQ-PROVIDER-145 |
| 22 | RESOLVED | No external editor is launched and no editor environment variable is consulted. Both flows open `.rotaris/agents.yaml` in the application's own configuration editor, validate the workspace configuration when the user applies the change, report any validation errors, and end sign-in reporting that manual configuration is required. Nothing waits on a child process to exit. | REQ-PROVIDER-097, REQ-PROVIDER-099 |
| 23 | RESOLVED | The sign-in method becomes three machine-readable tokens — `device-code`, `browser-pkce`, `api-key` — which are what is stored, compared, and branched on. Each has exactly one user-visible label, used identically everywhere a method is displayed or named, conveying how the user completes that sign-in (a code entered at the provider's site, a browser page, or a pasted key) and naming no command; its wording is left to the implementation. A provider resolving to no method is described as having its authentication managed by model configuration. | REQ-PROVIDER-148 (new), REQ-PROVIDER-140, REQ-PROVIDER-141 |
| 24 | RESOLVED | Neither wording is canonical, because no hint names a command at all. An unauthenticated provider's hint names the provider and directs the user to the in-application sign-in action for it, and is forbidden from directing the user to a third-party command-line tool, since the credential this product uses is the one its own device flow mints and any other token reads as unauthenticated. | REQ-PROVIDER-145, REQ-PROVIDER-142, REQ-PROVIDER-024 |
| 25 | RESOLVED | Provider status is decided by cause, never by searching an error message for a phrase — that string test is exactly the kind of arbitrary behavior this rewrite does not preserve. A catalog call refused with HTTP 401 or 403 yields `error` with the refusal as detail; every other catalog-call failure (transport failure, timeout, server error, malformed payload, any other refused status) yields `warning` with the reported failure as detail. | REQ-PROVIDER-118, REQ-PROVIDER-071 |
| 26 | RESOLVED | The four state tokens stay the machine-readable values; the tag shows one distinct human-readable phrase per state, conveying respectively that credit is available, that it is used up, that the account is in overdraft, and that the backend reported a state this build does not recognize. The four phrases must be distinguishable by their text alone, colour never carrying the distinction; their wording is left to the implementation. | REQ-PROVIDER-120, REQ-PROVIDER-130 |
| 27 | RESOLVED | Half-up, the same direction the money rule uses for every amount that is not a balance: clamp to 0–100, then round half-up to a whole number, so an exact halfway value rounds away from zero. One rule governs every percentage the domain displays, and the three usage readers now cite it instead of restating it. | REQ-PROVIDER-127, REQ-PROVIDER-124, REQ-PROVIDER-125, REQ-PROVIDER-126 |
| 28 | OMITTED | The two-label distinction is dropped rather than pinned to a guessed payload field. It was an arbitrary difference with no behavioral consequence — the same number, computed the same way, under a different name — and specifying it would have meant naming a payload field whose meaning cannot be established from any approved source. One label is used for the `premium_interactions` snapshot whatever the account's billing arrangement, conveying that the figure is that account's premium-request allowance, and the read never branches on a billing kind. The conditional " credits" suffix on the used label goes with it. | REQ-PROVIDER-125 (narrowed) |
| 29 | RESOLVED | One fixed marker, identical in every venue — log, user-visible error text, snapshot, event stream, hook payload. It carries no character of the value it replaced and its length does not vary with that value's length, so neither the secret nor its size can be inferred from redacted text. The marker's wording is left to the implementation provided it is uniform and reads as a redaction. The 2+4+2 mask is never used as a redaction marker: it exists only as the deliberate rendering of a key the user themselves stored. | REQ-PROVIDER-131, REQ-PROVIDER-107 |


> ## Amendment, 2026-09-02 — the credential and staging directories cite REQ-STARTUP-145 rather than restate it
>
> **What changed.** `REQ-PROVIDER-014` said the per-user data directory its credential files sit in
> "MUST be storage local to the machine rather than storage replicated to another machine or profile",
> and `REQ-PROVIDER-063` said the same for the Copilot gateway staging directory. `REQ-STARTUP-145` now
> states that property once, at the definition of the per-user directories, and declares itself the
> single statement of it. Both requirements now **cite** it and state it no longer.
>
> **Why the restatements were a defect and not merely redundant.** The property was stated four times in
> the corpus and defined nowhere. Every requirement that put something in a per-user directory and said
> nothing — which is most of them — inherited whatever the platform's own default was, and on the
> mandated desktop platform that default resolves under the replicated profile. Each requirement was
> individually defensible and the build was wrong overall. That is the shape of defect a citation fixes
> and a restatement cannot.
>
> **What was deliberately kept.** Each requirement keeps its own **reason** for relying on the property,
> because a reason is not the property. `REQ-PROVIDER-014` keeps "the protection `REQ-PROVIDER-016`
> applies to a file does not survive that file being replicated somewhere else"; `REQ-PROVIDER-063`
> keeps the whole paragraph explaining that what bounded these files inside the workspace bounds version
> control and local access and does not bound a synchronisation client replicating a bearer token to a
> vendor's servers. Those are the strongest sentences either requirement has and none of them is
> `REQ-STARTUP-145`'s.
>
> **The Data & Formats appendix** gained one sentence naming `REQ-STARTUP-145` as the definition of both
> per-user roots it spells out, so a reader who arrives at the appendix rather than at the requirement
> reaches the same place.
>
> **What was deliberately not done.** `REQ-PROVIDER-084`'s "unknown keys are rejected" for the provider
> snapshot was checked against the ESC-28 / ESC-29 ruling and left alone. That rejection is not a
> configuration load failure: `REQ-WORKSPACE-036` states that a snapshot failing validation contributes
> nothing and does not make configuration load fail, so no workspace is made unopenable by it and the
> ruling does not reach it.
