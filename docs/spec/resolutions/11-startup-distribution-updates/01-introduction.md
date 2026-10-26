# Resolution Record — Domain 11, Application Startup, Distribution, and Updates — introduction

Part 1 of 5 of [domain 11's resolutions](../11-startup-distribution-updates.md), which indexes every part.




> ## Amendment, 2026-10-22 — the background download and the next-start apply (R-084): thirteen identifiers decided, not derived
>
> `REQ-STARTUP-169` to `REQ-STARTUP-181` are minted under a new subsection of domain 11, "Background download, the pending
> update, and the next-start apply". **They are not a resolution of anything derived.** The owner asked for behaviour the
> specification does not have — the update downloaded with no click, kept as a pending update, verified again from the
> retained bytes and applied at the next start or by `Restart now` — and asked, explicitly, for new requirement
> identifiers for it rather than a directive's narrative alone ([R-084](../../../product/requests.md#r-084)).
>
> **Why this departs from the layer rule, and how the departure is bounded.** [`../../product/README.md`](../../../product/README.md)
> keeps owner-decided behaviour out of this corpus so that `REQ-` keeps meaning "derived". The owner's ask is honoured
> without spending that distinction: the subsection opens with a note saying that every identifier in it is decided, not
> derived, and is no evidence about the behavioural target; [`PD-STARTUP-008`](../../../product/directives/pd-startup-008.md#pd-startup-008)
> and [`PD-SHELL-005`](../../../product/directives/pd-shell-005.md#pd-shell-005) revision 2 carry every displacement of a derived requirement,
> each with its back-pointer; and no derived requirement's text is rewritten. A reader separating the derived corpus from
> the decided additions reads the subsection's heading note. Whether later owner requests may mint identifiers the same
> way is not settled by this amendment.
>
> Clauses marked *reserved* name decisions UD-1 to UD-12 of
> [`../../architecture/background-update-plan.md`](../../../architecture/background-update-plan.md) §6, which are the owner's and
> are not taken. **Recorded, not built.**

> ## Amendment, 2026-10-13 — the platform-convention directory variables (OQ-247)
>
> `REQ-STARTUP-147`'s list of the environment variables this domain reads gains a class: the platform-convention directory
> variables `XDG_CONFIG_HOME`, `XDG_DATA_HOME` and `XDG_RUNTIME_DIR` (Linux) and `LOCALAPPDATA` (Windows), each locating a
> directory and deciding nothing else, used only when its value names an absolute directory and otherwise replaced by the
> convention's default, and bound by the list's second sentence. The home and temporary directories the operating system
> reports are taken through the platform's own interfaces, outside the list. The requirement's earlier text is kept; the
> amendment is written beneath it.
>
> **Why this is an amendment and not a directive.** Read as exhaustive — and `REQ-STARTUP-111`'s acceptance reads it as a
> closed enumeration — the list omitted reads two live requirements depend on: `REQ-CONFIG-001` spells the Windows root as
> `%LOCALAPPDATA%\rotaris\rotaris\`, and `REQ-UIBENCH-039` requires `XDG_CONFIG_HOME` to be honoured. Live requirements
> disagreed, and nothing the product does changes. Ruled under the owner's delegation
> ([R-072](../../../product/requests.md#r-072)); the ruling is in
> [`open-questions.md`](../../../architecture/open-questions/52-spikes-and-later-questions-19.md#oq-247).


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - **OQ 1** — "the onefile Windows portable executable gets no allowance for being a single file". That
>   still holds for the steady state, but the record now **understates** the requirement: under **SR-7**
>   REQ-STARTUP-155 carries a first-run exemption, and "first run" means the first run of a given artifact
>   **version**, on a machine, for that user — not per flavour and not first run ever.
> - **OQ 5** — the closed set of release-acceptance criteria, each "decidable inside the pipeline or on a
>   machine the release owner controls". That phrase is precisely the defect **ESC-11** identified: a gate
>   run on a controlled machine can pass while REQ-STARTUP-024's unmodified baseline fails. REQ-STARTUP-156
>   now requires four conditions to be established before a pass may be recorded, and a check that cannot
>   establish them is recorded not-performed and fails the gate. **Do not cite this row as licensing the
>   weaker gate.**
> - **OQ 14** — the Windows installed/portable discriminator resolves "the running executable" inside the
>   InstallDir path. Under SR-7 the running image may sit in a launch preparation, so the test now resolves
>   **the artifact the launch started from** (REQ-STARTUP-106, REQ-STARTUP-165).
>
> ## Also superseded, by ESC-8 and the ESC-11 follow-through applied 2026-09-01
>
> - **OQ 5's gate set is closed again, one item larger.** Row 5 below states it as "`SHA256SUMS.txt`
>   covers every other asset and every digest matches; the release body carries its seven elements;
>   and on each of the three platform keys the published artifact has been downloaded and launched to
>   first paint". Under **ESC-8** REQ-STARTUP-156 additionally requires that the **manifest's detached
>   signature verifies**, and that it verifies against a key carried by every published artifact the
>   release may be offered to as an update. A release passing every criterion in row 5 but failing
>   either of those would be refused by every user's update client, so the two belong in the gate. Row
>   5's requirements column should be read as also naming REQ-STARTUP-167 and REQ-STARTUP-168.
> - **Any row treating the checksum manifest as establishing only *what* was downloaded is superseded.**
>   REQ-STARTUP-123's closing sentence used to say the check "does not establish who produced the
>   artifact, since artifacts are unsigned and the manifest is fetched over the same connection as the
>   download". That was exactly ESC-8's defect. The digest comparison still detects a corrupted or
>   incomplete transfer — that guarantee is preserved verbatim — but publisher authenticity for the
>   update path is now established by the signature, and an unverified manifest reaches no parser and
>   costs no download.
> - **Row 10's verification hint is unchanged and now covers less than the product does.** The release
>   body still names `sha256sum -c` and `certutil`, which check the digest and not the signature, and
>   the hint is deliberately not extended because doing so would require naming a
>   signature-verification tool and therefore a technology. A user who downloads by hand from the
>   release page still gets an unsigned binary; the signature protects the **update path**. This is a
>   narrow but real gap and is recorded rather than hidden.
> - **REQ-STARTUP-165's clause (c) is no longer silent in every case.** The disposition that launch
>   preparations are invisible holds for the four outcomes clause (f) names, and no fifth. Where a run
>   produces **no usable preparation at all** — the storage refusing the write, being full, or
>   unavailable, so redoing does not succeed either — the artifact still starts, never fails to launch
>   for that reason, is exempt from the first-paint bound on REQ-STARTUP-155's terms, and reports the
>   outcome once per run after paint. Without that, the recovery path degenerates into preparing on
>   every launch, silently, and a user sees only an artifact that has become permanently slow with
>   nothing saying why.


> ## Amendment, 2026-09-02 — REQ-STARTUP-145 states which per-user location is meant
>
> **The defect.** REQ-STARTUP-145 said "platform-conventional configuration and data directories" and
> said nothing about a platform that offers a user **two** per-user locations — one the platform
> replicates to the user's other machines or to another copy of their profile, and one that stays on the
> machine in use. Four requirements that need the machine-local one each said so for themselves
> (REQ-SESSION-198, REQ-PROVIDER-014, REQ-PROVIDER-063, and this domain's REQ-STARTUP-165 (a)), so the
> corpus was satisfiable and **no build reading any one of them was wrong** — and a build was still wrong
> overall, because the requirements that place things there and say nothing inherit the platform default.
>
> **It is measured rather than anticipated.** On the machine that ran spike 20 the platform layer's
> default per-user data path resolved under the replicated profile, and a launch preparation derived from
> it would have placed a full payload per artifact version into replicated storage. The spike's own
> anchor payload was 507.9 MiB — that figure is the deliberately ballasted `W150` anchor adopted from
> spike 17 so the two spikes' numbers sit on one axis, not a prediction of the shipping product's weight
> — and §8.2 measured two such trees present at once after launching two versions, so the cost is per
> version left unreclaimed rather than one-off. What the measurement establishes is the **trap**, not the
> size: the default resolves to the replicated location on the platform this product mandates.
>
> **The fix is at the definition, in one clause.** REQ-STARTUP-145 now states, once, that where a platform
> offers both, the per-user configuration and data directories of this product are the location local to
> this machine and not replicated, copied or synchronised to any other machine or to any other copy of the
> user's profile; that where only one exists the clause selects nothing; and that where the platform's own
> default is the replicated location, **this requirement governs over that default** — conformance being
> decided by the directories the product actually writes to, never by the one a platform layer would have
> chosen unasked. It names no operating-system directory and no platform interface. It also states why the
> clause is at the definition: each mechanism is individually harmless in a replicated location and they
> are jointly wrong, because a record describing *this* machine describes a machine it is not on as soon
> as it is replicated to a second one.
>
> **Dependents now cite rather than restate.** REQ-STARTUP-165 (a) drops its own machine-local sentence and
> cites REQ-STARTUP-145; REQ-STARTUP-070 and REQ-STARTUP-087 gain the citation; the Data & Formats entries
> for the launch preparation, the single-instance record and the per-user setup layout follow.
> **REQ-STARTUP-161 gains the property it never had**, which is the third mechanism the architecture record
> named: the single-instance record is now fixed to that location, because a replicated record would offer
> a launch a process that was never running on this machine and REQ-STARTUP-164's resolution would have to
> reclaim it on every launch.
>
> **One restatement was checked and deliberately kept.** REQ-STARTUP-165 (c) permits a run-scoped placement
> in a closed set of **two** locations, and only the first of them — the per-user data directories —
> inherits the property from REQ-STARTUP-145. The platform's transient-files storage is not those
> directories and inherits nothing, so the prohibition on replicated storage is retained in clause (c) and
> the retention is explained in its own text, rather than deleted as a duplicate of the owner's rule.
>
> **Per-workspace state is untouched.** `<workspace>/.rotaris/` is not per-user state: it stays wherever
> the user put the workspace, on whatever storage they chose, and REQ-STARTUP-145 now says so explicitly so
> that the new clause cannot be read as licensing the product to relocate or refuse a workspace on shared
> or replicated storage, which REQ-STARTUP-166 reports and never refuses.


This record disposes of every open question raised in the draft of
[`../11-startup-distribution-updates.md`](../../11-startup-distribution-updates.md) (requirement prefix
`REQ-STARTUP`). The body of that specification has been amended so that each decision below is
stated normatively in place; the original open-question numbering is preserved here so that the
draft and the resolved specification can be read against one another.

The product-owner decisions in force while these were resolved:

1. **Compatibility ambition: behavioral inspiration only.** The rewrite has no obligation to match
   any other implementation's formats, surface, exit codes, or event vocabulary. Where a case was
   under-determined, this record chooses; awkward or arbitrary behavior is never preserved for
   compatibility's sake.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved to the reading more
   coherent with the rest of the document; where no coherent reading exists, the behavior is omitted
   rather than reproduced.
3. **Unbuilt-but-intended behavior is in scope.** No requirement was dropped merely for describing
   intent rather than something known to work.
4. **The product is one Electron desktop application.** It has no command-line interface and no
   terminal user interface — not deferred, removed. Domains 17 and 18 are retired and the `REQ-TUI`
   and `REQ-CLI` identifiers are withdrawn. See the graphical-only sweep below for what that did to
   this domain. Running external programs — the agent's own terminal commands, lifecycle hooks,
   tool servers on the stdio transport, version-control invocations and child processes the product
   starts internally — all remain fully in scope.
5. **No legacy-directory adoption anywhere in the product.** A clean-room product has no earlier
   directory to migrate from.
6. **Message text states what a message must convey, not its exact wording**, except where a string
   is part of a machine-readable contract.
