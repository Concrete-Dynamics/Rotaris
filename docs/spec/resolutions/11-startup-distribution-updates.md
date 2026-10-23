---
reference: ROTARIS-CRW-001
domain: startup-distribution-updates
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 11, Application Startup, Distribution, and Updates



> ## Amendment, 2026-10-22 — the background download and the next-start apply (R-084): thirteen identifiers decided, not derived
>
> `REQ-STARTUP-169` to `REQ-STARTUP-181` are minted under a new subsection of domain 11, "Background download, the pending
> update, and the next-start apply". **They are not a resolution of anything derived.** The owner asked for behaviour the
> specification does not have — the update downloaded with no click, kept as a pending update, verified again from the
> retained bytes and applied at the next start or by `Restart now` — and asked, explicitly, for new requirement
> identifiers for it rather than a directive's narrative alone ([R-084](../../product/requests.md#r-084)).
>
> **Why this departs from the layer rule, and how the departure is bounded.** [`../../product/README.md`](../../product/README.md)
> keeps owner-decided behaviour out of this corpus so that `REQ-` keeps meaning "derived". The owner's ask is honoured
> without spending that distinction: the subsection opens with a note saying that every identifier in it is decided, not
> derived, and is no evidence about the behavioural target; [`PD-STARTUP-008`](../../product/directives.md#pd-startup-008)
> and [`PD-SHELL-005`](../../product/directives.md#pd-shell-005) revision 2 carry every displacement of a derived requirement,
> each with its back-pointer; and no derived requirement's text is rewritten. A reader separating the derived corpus from
> the decided additions reads the subsection's heading note. Whether later owner requests may mint identifiers the same
> way is not settled by this amendment.
>
> Clauses marked *reserved* name decisions UD-1 to UD-12 of
> [`../../architecture/background-update-plan.md`](../../architecture/background-update-plan.md) §6, which are the owner's and
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
> ([R-072](../../product/requests.md#r-072)); the ruling is in
> [`open-questions.md`](../../architecture/open-questions.md#oq-247).


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
[`../11-startup-distribution-updates.md`](../11-startup-distribution-updates.md) (requirement prefix
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

## Graphical-only sweep

### Scope boundary applied

The sweep removes every surface through which a **user of the application** drives the application
itself from a shell or from a text-mode interface. Three things it deliberately does not remove,
each named as in scope by decision 4 or outside the product's own interface altogether:

- **The maintainer-side build and release pipeline** (REQ-STARTUP-008 to REQ-STARTUP-011,
  REQ-STARTUP-027 to REQ-STARTUP-038). This is release tooling driven by automation, not a surface
  the shipped product exposes to anyone who installs it; REQ-STARTUP-008 now says so in its own
  text. Its stdout lines and exit codes are how one program reports to another inside the pipeline
  and are retained on that basis.
- **The platform installer's own silent-installation flags** (`/S`, `/D=<dir>`, `Uninstall.exe /S`
  in REQ-STARTUP-017 and REQ-STARTUP-019). These drive the Windows installer artifact, which is a
  platform deployment convention, not this product's interface; withdrawing them would remove
  unattended deployment, a real capability, and replace it with nothing.
- **Child processes the product starts internally**, including the bundled code-intelligence tool
  server. REQ-STARTUP-015 was rewritten so that the reserved token of REQ-MCP-033 is stated as a
  sentinel for a child process rather than as a user-facing flag on the product's executable, and
  the third-party server name the draft used was replaced by the role name domain 16 fixes.

The Python-package publication channel (REQ-STARTUP-001, REQ-STARTUP-036) is retained. It carries no
shell-surface clause of its own once the console scripts are gone: it is a distribution channel, and
the document already classifies an installation made through it as never updatable
(REQ-STARTUP-106), which is unchanged.

**Superseded by the fifth reconciliation round.** That disposition was right about the sweep — the
publication channel carried no shell surface, so the graphical-only decision had no claim on it — but
it kept two requirements that a later round found to be wrong on a different ground. Packaging and
distribution technology is an architecture decision, not a behavioral requirement: which runtime the
product embeds, how many artifacts a release produces, and which ecosystem's package index serves
them are not things a user observes. Stated in terms of one language ecosystem's interpreter and
packages, REQ-STARTUP-001, REQ-STARTUP-012 and REQ-STARTUP-036 specified a different product, and all
three are now **withdrawn in place**. What a user does observe is preserved and is now stated
technology-neutrally: REQ-STARTUP-158 fixes that a release carries exactly one product version which
every artifact of it declares and reports, guarded before build by REQ-STARTUP-028; REQ-STARTUP-159
fixes that what the user installs is self-contained and starts on a supported baseline with nothing
else installed and all outbound network blocked, with the true release version on the About surface.
REQ-STARTUP-036 had nothing left to rescue — the artifact set is REQ-STARTUP-031's and the prerelease
case is REQ-STARTUP-029's and REQ-STARTUP-034's. REQ-STARTUP-106, which classifies an installation
not made from a released standalone artifact as never updatable, is unaffected and still stands.

### Requirements withdrawn, and where the capability went

| Withdrawn | What its surface was | Capability now carried by |
| --- | --- | --- |
| REQ-STARTUP-003 | `python -m rotaris` behaving as the desktop entry point, "including all flags" | Nothing to rescue — starting the application is the operating system's job through the artifacts of REQ-STARTUP-031, and the single entry point is REQ-STARTUP-002 |
| REQ-STARTUP-005 | The desktop `--version` flag printing `Rotaris {version}` to stdout and exiting 0 | REQ-STARTUP-007 (what the running version is) and REQ-SHELL-140 (the About surface presents it as selectable text). REQ-STARTUP-007 and REQ-STARTUP-012 were amended to name that surface |
| REQ-STARTUP-006 | A `version` subcommand on the two console hosts, and its exemption from the pre-step of REQ-STARTUP-100 | Same as REQ-STARTUP-005; the pre-step it excepted itself from is gone with REQ-STARTUP-100 |
| REQ-STARTUP-039 | The whole desktop argv contract: positional workspace, `--demo`, `--version`, `--diagnostics [light\|deep]`, `--diagnostics-output PATH`, and its exit-2 usage error | Workspace: REQ-STARTUP-041 (as amended) and REQ-STARTUP-052 / REQ-SHELL-021. Demo mode: REQ-SHELL-162. Version: REQ-STARTUP-007 / REQ-SHELL-140. Diagnostics capture: REQ-STARTUP-129 (as amended) reading the Settings controls of REQ-SHELL-163 |
| REQ-STARTUP-098 | `rotaris-cli setup [--workspace PATH]` — stderr step lines, a bare outcome word on stdout, exit 1 for degraded or cancelled | **REQ-STARTUP-153** (new) — machine setup is re-runnable from Settings after first launch, whole or step by step, reading and updating the same `setup/state.json` (REQ-NOTIFY-265, REQ-CONFIG-397). The repair route of REQ-STARTUP-103 already carried the whole-pass case |
| REQ-STARTUP-099 | `rotaris-headless setup [--workspace PATH]`, identical contract | **REQ-STARTUP-153** (new), as above |
| REQ-STARTUP-100 | The automatic bundled ensure-setup pre-step in front of every console command, with `setup: {message}` lines on stderr | REQ-STARTUP-044 and REQ-STARTUP-096 (the desktop schedules setup before repository discovery and before onboarding) and REQ-STARTUP-089 (the managed environment is activated at desktop startup before any child process can launch). The "never open a GUI, never block on one" clause had no referent left |
| REQ-STARTUP-145, migration clause only | The one-time silent rename of a legacy per-user and per-workspace directory | Nothing to rescue — decision 5. The rest of REQ-STARTUP-145, which defines the per-user and per-workspace locations, survives — since amended by the 2026-09-02 block above, which adds which per-user location is meant where a platform offers more than one |

### Requirements amended to strike a shell-surface clause

REQ-STARTUP-002 (console, headless and benchmark executables struck — the benchmark capability is
carried by REQ-UIBENCH-110 and REQ-UIBENCH-111, which make it a built-in desktop capability);
REQ-STARTUP-008 (targets reduced to the desktop binary, and the command declared maintainer-side);
REQ-STARTUP-012 (`--version` clause replaced by the About surface — the requirement was later
withdrawn in full, see the supersession note above);
REQ-STARTUP-013 and REQ-STARTUP-031 (console archives removed as an artifact kind);
REQ-STARTUP-015 (self-invocation flag replaced by the REQ-MCP-033 sentinel);
REQ-STARTUP-024 (the AppImage `Exec` argument restated as a folder the desktop environment hands
the application through an "open with" or drag-onto-icon gesture — a graphical route that is a real
capability and is kept);
REQ-STARTUP-040 (toolkit-versus-app argument parsing struck);
REQ-STARTUP-041 (branch (a) restated as a folder the operating system hands the launch);
REQ-STARTUP-055 (`rotaris --demo` restated as demo mode, REQ-SHELL-162);
REQ-STARTUP-089 (the console pre-step removed from the list of activation points);
REQ-STARTUP-106 (the not-updatable class restated as any build not running from a released
standalone artifact);
REQ-STARTUP-129 (diagnostics activation restated as the preference store of REQ-SHELL-163);
REQ-STARTUP-147 (the diagnostics environment variables removed from the read list);
REQ-STARTUP-149 (desktop and console exit codes struck; the pipeline's own exit codes retained);
REQ-STARTUP-150 and REQ-STARTUP-152 (references to withdrawn surfaces re-pointed);
and, in Data & Formats, the console setup contract, the console archive names and the diagnostics
environment variables.

The section heading "Desktop launch: command line and startup sequence" became "Desktop launch and
startup sequence"; "Setup for console hosts" became "Re-running setup after first launch".

## Dispositions

| OQ # | Disposition | Decision taken | Requirements touched |
| --- | --- | --- | --- |
| 1 | RESOLVED | Three bounds are fixed and the rest is declared deliberately unspecified rather than left as a gap. First paint happens within **5 seconds** of launch, and that budget is the same for every artifact and both bundle modes — the `onefile` Windows portable executable gets no allowance for being a single file, because a user cannot see which flavour they installed. The fast-path decision of REQ-STARTUP-066 (the plan is empty) is reached within the **100 ms** interface-responsiveness budget and delays neither first paint nor post-show activation. An all-tools-already-satisfied pass is bounded by the probes it is built from: its wall time never exceeds the sum of the 10-second per-probe timeouts over the manifest's tools, counted twice for the detect and record steps that both probe. Download durations, per-step pacing, and the visual rendering of the setup dialog and update banner beyond widget structure, text and accessibility metadata are stated as not specified, and a build is explicitly not non-conformant for any of them. | **REQ-STARTUP-155** (new), REQ-STARTUP-013, REQ-STARTUP-063, REQ-STARTUP-066, REQ-STARTUP-069, REQ-SHELL-150 |
| 2 | RESOLVED | Demo mode is silent on every runtime. A demo window issues no request to the release endpoint and none to any asset URL whether or not it is a standalone build, never presents an update notice, and does not consult the installation flavour at all — a demo window is not offering to update the installation it happens to be running from. The draft's two halves are now one answer read from both sides: REQ-STARTUP-057 states it as a property of demo mode and REQ-STARTUP-114 as a property of the check. A non-demo window in the same process is unaffected. | REQ-STARTUP-057, REQ-STARTUP-114 |
| 3 | RESOLVED | A running prerelease is offered the stable release of its own numeric tuple. The order is the numeric tuple first and the prerelease rank second: a prerelease of a tuple sorts before the plain release of that tuple, and among prereleases of one tuple the rank is `a` before `b` before `rc` with the numeric suffix breaking ties within a kind. So `1.2.3rc1` is offered `v1.2.3`. The alternative — tuple comparison alone — would combine with the feed's prerelease filter to strand every prerelease user until the next patch release, offering them nothing while the release that supersedes them sits published; that is the incoherent reading, so it is not taken. | REQ-STARTUP-109 |
| 4 | RESOLVED | The criterion is positive and rests on three closed enumerations that together are every configuration surface a user of this product has: the desktop preference store (REQ-SHELL-006, REQ-CONFIG-463, enumerated by REQ-STARTUP-146 here and by REQ-CONFIG-405 and REQ-SHELL-163 elsewhere), the layered YAML surface, and the environment variables of REQ-STARTUP-147. A release is accepted only when no entry in any of the three names update checking, an update endpoint, a release source or an update channel — checkable by reading the enumerations, each maintained by the domain that owns it, this domain owning only two of them. There is no fourth enumeration to maintain and no owner to appoint for one, because the product has no command-line arguments and no text-mode interface; the hardest part of the question disappeared with the sweep. | REQ-STARTUP-111, REQ-STARTUP-146, REQ-STARTUP-147 |
| 5 | RESOLVED | None of them is a release gate, and the gate set is now closed and written out. Release acceptance rests only on evidence the product can produce: the version and package-pin guards passed; notices validation passed on every contributing platform; `SHA256SUMS.txt` covers every other asset and every digest matches; the release body carries its seven elements; and on each of the three platform keys the published artifact has been downloaded and launched to first paint at least once, so the offline-run claim is observed rather than assumed. Release-page rendering, the host's treatment of the prerelease flag, rate-limit responses, OS trust-warning wording and silent-install shell integration are observed and disclosed, never guaranteed, and none of them blocks or retracts a release. That is consistent with REQ-STARTUP-110: a check that fails because an external behavior changed is invisible by design, so no release needs holding against it. | **REQ-STARTUP-156** (new), REQ-STARTUP-021, REQ-STARTUP-023, REQ-STARTUP-110 |
| 6 | RESOLVED | A `.partial` file stays eligible indefinitely — no age, launch count or manifest change expires it — because eligibility is cheap and safe: nothing is ever promoted without matching its pin, so a stale partial can only cost a repeated transfer, never a wrong install. When the assembled file's digest does not match, the step deletes both the assembled file and the partial and retries **exactly once from byte zero with no `Range` header**; only a second, wholly fresh transfer that also mismatches fails the step with the REQ-STARTUP-084 mismatch message. One retry, not zero (a resumed transfer is the likeliest cause of a mismatch and re-downloading is the fix) and not unbounded (a genuinely wrong pin must fail rather than loop). | REQ-STARTUP-084 |
| 7 | RESOLVED | Identical presentation, stated normatively. The dialog's page-title vocabulary stays two-valued — `Preparing Rotaris` and `Repair machine tools` — and a top-up that was not manually requested carries `Preparing Rotaris`; no third title, explanation or badge is introduced. The difference is already visible where it matters: the step list shows the already-satisfied tools as satisfied steps and only the missing work as install or warm-up steps. The top-up marking is internal, deciding the plan's content and not what the user is shown. | REQ-STARTUP-068, REQ-STARTUP-090, REQ-STARTUP-067 |
| 8 | OMITTED | The behavior it asks about no longer exists. Under the no-legacy-directory-adoption decision, a clean-room product has no earlier directory to migrate from and naming one would require a forbidden source, so the one-time rename clause was struck from REQ-STARTUP-145; with no migration there is no race to serialize and nothing for a losing process to observe. What survives of REQ-STARTUP-145 is the per-user and per-workspace location definition, plus a new positive statement that the product adopts no directory belonging to any earlier or differently named product and creates its own on first use. | REQ-STARTUP-145 (migration clause struck) |
| 9 | RESOLVED — **half superseded** | Emulation is an expectation, not a supported configuration: it carries no acceptance criterion, no release is blocked by a failure seen only under emulation, and the gate of REQ-STARTUP-156 exercises exactly the three platform keys and no fourth. The download page must speak to a visitor whose platform has no published artifact. On Windows ARM64 it states which artifact it is offering, states that the artifact is built for a different processor architecture and is not tested on that platform, and still offers the download rather than withholding it. On Intel macOS, where no artifact can run at all, it states that the release publishes no macOS build for that architecture and offers no macOS download. Wording is left to the implementation. **The platform-scope half stands and is REQ-STARTUP-156's. The download-page half is superseded by the sixth reconciliation round**, which withdrew REQ-STARTUP-144: a public marketing website is not this product, and a behavioral specification for an application cannot bind one. What the page was required to say to a visitor whose platform has no published artifact is stated by REQ-STARTUP-026 itself and needed no second statement, and the distribution claims no download surface may contradict are REQ-STARTUP-038's; the promotion gate and the page's translation and link obligations are not rescued at all, because they belong to the page rather than to the product. | REQ-STARTUP-026, REQ-STARTUP-144 (withdrawn), **REQ-STARTUP-156** (new) |
| 10 | RESOLVED | The release body names `certutil -hashfile <filename> SHA256` for Windows, chosen because it is present on every supported Windows installation and needs nothing installed, alongside `sha256sum -c SHA256SUMS.txt` for macOS and Linux. The output format is described to the extent a reader needs it: the body states that the hexadecimal digest the Windows command prints is compared, ignoring case and ignoring any spacing the command inserts, against the line of `SHA256SUMS.txt` carrying that filename. No parser is specified, because the comparison is done by a human eye. | REQ-STARTUP-035 |
| 11 | RESOLVED | The confirmation offers exactly two answers — close anyway, and return to the window — with the returning answer the default; Escape and the close control are both that returning answer (REQ-SHELL-055). Its text conveys exactly three things, wording left to the implementation: that a run is still executing, that closing ends it, and that the alternative is to return and let it finish. The second half of the question is answered yes and stated normatively: declining leaves every piece of window state untouched — same workspace, same active view, same composer contents, same pending deferred prompts, same in-flight update work, same persisted settings — so a declined close is indistinguishable from a close never attempted, which is what REQ-STARTUP-047 needs when it discards a replacement window. | REQ-STARTUP-046, REQ-STARTUP-047, REQ-SHELL-055 |
| 12 | RESOLVED | The workspace chooser uses the same three gates in the same fixed order as a window close, which the shell domain already fixed: unsaved settings, then worktree integration, then active runs. One order for both flows is more coherent than two, and the close order is the one already settled. The unsaved-settings gate has no refusal message of its own — the save/discard/cancel dialog of REQ-SHELL-124 *is* the message, and the user clears the condition by saving or discarding: Cancel ends the flow with nothing changed, a Save that fails also ends it, and a successful Save or a Discard lets evaluation continue. The two existing outright refusals keep their exact sentences. A decline opens no chooser and changes no window, workspace or stored preference. | REQ-STARTUP-053, REQ-SHELL-021, REQ-SHELL-119, REQ-SHELL-124 |
| 13 | RESOLVED | The sort key is the deduplication key: the pair (runner family, package specification), sorted ascending, runner family first and then package specification, each compared as a sequence of Unicode code points with no case folding. One key serves both purposes, so the two can never drift apart, and neither the rendered label nor the configuration order can influence the sequence. Two further exclusions were made explicit while the requirement was open: a server entry carrying `enabled: false` contributes no warm-up (nothing will ever launch it, REQ-CONFIG-465), and a `stdio` entry whose command is the reserved bundled-runtime token contributes none either (what it resolves to ships inside the artifact, REQ-MCP-033). | REQ-STARTUP-064, REQ-CONFIG-465, REQ-MCP-033 |
| 14 | RESOLVED | The discriminator is the installer's own record, not the shape of the files: the build is installed if and only if the per-user registry value `InstallDir` exists under `HKCU\Software\Rotaris` and the running executable resolves inside the directory it names; every other Windows standalone build is portable. Only the installer writes that value and uninstallation removes it, so the classification follows the installation that actually exists. The failure mode is bounded and safe by construction: a user who copies an installed tree elsewhere is classified portable, and the portable strategy replaces the running executable with a self-contained one that runs from any location — so a misclassification costs a flavour change, never a broken installation. | REQ-STARTUP-106, REQ-STARTUP-016, REQ-STARTUP-019, REQ-STARTUP-125 |
| 15 | RESOLVED | The name gains the first free `-2`, `-3`, … suffix, tried in ascending order and created exclusively each time — the same deterministic suffixing discipline REQ-GIT-010 uses for branch names. Diagnostics never silently disables itself for a name collision and never prevents a window from opening; two windows starting in the same second simply get adjacent directories. The one remaining failure — the base directory itself being unwritable, so no name can be created at all — opens the window with diagnostics inactive and says so in the diagnostics card of REQ-SHELL-163 rather than failing the launch. | REQ-STARTUP-131, REQ-GIT-010, REQ-SHELL-163 |
| 16 | RESOLVED | Split into what must be fixed and what must not. **Not fixed, deliberately:** field names and nesting. These files have exactly one consumer, the product's own diagnostics surfaces (REQ-NOTIFY-267); no other program is entitled to read them and no cross-implementation compatibility is required, so naming is an implementation choice — now stated as the requirement rather than as a gap. **Fixed:** the files are self-describing (each carries its schema version), names and nesting are stable for the life of a schema version so a changed layout requires a new version, every value the document requires is present, and the units are uniform — milliseconds for durations, integer bytes for memory and written volume, bytes per second for rates, whole numbers for percentages, ISO-8601 UTC for timestamps. Per-view counters: one entry per primary view of REQ-SHELL-023, keyed by that view's lower-cased name, carrying exactly whether the view is visible, its live widget count, and the number of items in its principal collection. Growth rate: the slope of an ordinary least-squares fit of retained resident-memory bytes against elapsed seconds, reported as 0 and flagged with fewer than two samples. Percentiles are flagged approximate below 100 retained lag samples. Growth sites rank by sampled retained bytes descending, ties broken by source file then line ascending, so the ranking is total. | **REQ-STARTUP-157** (new), REQ-STARTUP-132, REQ-STARTUP-134, REQ-STARTUP-137, REQ-STARTUP-140, REQ-SHELL-023 |
| 17 | RESOLVED | The address is a release-time input, not a specification constant, and the requirement now says so with teeth. The header must give a single contact route that is reachable without registering for or holding an account with any service, is monitored by the maintainers, and appears as a literal string in the file rather than as a reference to a page that must be visited to find it. A build whose header carries no address, or only a placeholder, fails the notices validation of REQ-STARTUP-143 — so the obligation is enforced by the pipeline instead of being carried as an unanswered question. | REQ-STARTUP-142, REQ-STARTUP-143 |
| 18 | RESOLVED | The table is a version-controlled file in the product repository held beside the notices generator that reads it, so adding an exception is a reviewed change and the table can never disagree with the build it covers. Each entry carries component name, the version or version range it covers, the license identifier claimed, why no license text is obtainable, the reviewer, the review date, and an expiry date. Entries do expire: an expiry is at most **365 days** after the review date, and an expired entry — or one whose range excludes the shipped version — is treated exactly as no entry at all, so validation fails and the exception is reviewed again rather than ageing into a permanent hole. | REQ-STARTUP-143 |
| 19 | RESOLVED — **superseded** | Binding, but on the promotion step rather than on the build, which is the only split that works for a page maintained outside the application. A release may be published and its assets downloaded from the release page before the disclosure has been reviewed; what may not happen is that the download page offers that release, or names its version, before confirmation is recorded that the disclosure still matches the setup and update behavior this document specifies. The checklist item belongs to whoever performs the release — the same person the acceptance criteria of REQ-STARTUP-156 answer to — and no separate owning team is created, since a gate with a second owner is a gate that stalls. **Superseded by the sixth reconciliation round.** The gate was a promotion step over a public marketing website, and REQ-STARTUP-144 is withdrawn: the website is not this product and this document cannot bind one, so the checklist item and the clause REQ-STARTUP-151 named for it go with it. What the question was protecting — that a user is told in the product's own words what the product puts on the network — is not lost and is not a page obligation at all: **REQ-STARTUP-160** (new) requires the disclosure on the About and Legal surface, readable with all outbound access blocked and never behind a dismissal, and makes a build whose behavior disagrees with it non-conformant. | REQ-STARTUP-144 (withdrawn), **REQ-STARTUP-156** (new), **REQ-STARTUP-160** (sixth round) |
| 20 | RESOLVED | Yes, warned at the point of use, and a new requirement carries it. When a user performs an action needing a capability that is in the record's degraded list, the action is declined rather than attempted and failed obscurely, and the transient error notification of REQ-SHELL-112 conveys three things: which capability is unavailable, which machine tool is missing, and that machine setup can be run again from Settings. Wording is left to the implementation (decision 6). The decline changes nothing — no partial application — and the action stays available once the tool is provisioned. Capabilities absent from the list behave exactly as after a `complete` setup and raise no warning, so the warning appears if and only if the record says the capability is degraded; accepting degradation suppresses the setup dialog, never the point-of-use warning. | **REQ-STARTUP-154** (new), REQ-STARTUP-077, REQ-STARTUP-080, REQ-STARTUP-095, REQ-SHELL-112, REQ-NOTIFY-265 |
| 21 | RESOLVED | A pre-build guard, in the same stage as the version guard of REQ-STARTUP-028 — one stage, exit code 1, all platform builds stopped, message naming the package, both version strings (or the absence of one) and both file locations. Per-platform pre-freeze validation was rejected because a pin disagreement is a property of the release, not of a platform, and would otherwise be reported three times or, worse, let one platform build succeed. And yes to the second half: the manifest must pin **every** package the built-in default tool-server configuration launches through `npx` or `uvx`, not only those it happens to list; a default entry naming an unpinned package fails the same guard. The draft's literal third-party package name and version were removed at the same time, since REQ-CONFIG-181 and REQ-MCP-010 leave those identities to the implementation — what this document fixes is the agreement, not the identity. | REQ-STARTUP-059, REQ-STARTUP-028, REQ-CONFIG-181, REQ-MCP-010 |
| 22 | RESOLVED | The most recent N — each cap is a ring in which a new sample displaces the oldest retained one, so run-wide statistics describe the most recent window. This is the reading the rest of the document already assumes, since growth and lag figures exist to judge a session that has been running for a while, and it is the only one of the three candidates that keeps a long run's statistics meaningful. Nothing about the run's beginning is lost by it: `summary.json` reports resident memory at start and at peak from values carried forward independently of the ring, and the summary additionally states whether either cap was reached during the run, so a reader can tell a complete sample set from a truncated one. | REQ-STARTUP-133, REQ-STARTUP-137 |
| 23 | MOOT | The question asks what layout a console archive must contain and what entry names a user sees after extracting it. There are no console binaries and no console archive: REQ-STARTUP-002 was rewritten in the graphical-only sweep to declare exactly one executable entry point, and the archive kind was removed from REQ-STARTUP-031 and from the bundle-mode assignment of REQ-STARTUP-013. The four remaining artifact kinds each carry a single desktop payload whose layout REQ-STARTUP-011 and REQ-STARTUP-013 already fix. | REQ-STARTUP-002 (amended), REQ-STARTUP-013, REQ-STARTUP-031 |

Nothing was escalated. Every question above was answerable as a design decision inside this domain or
by adopting a vocabulary another domain had already fixed.

## New requirements introduced

| ID | Section | Why it exists |
| --- | --- | --- |
| REQ-STARTUP-153 | Re-running setup after first launch | Rescues the capability of the withdrawn console `setup` subcommands (REQ-STARTUP-098, REQ-STARTUP-099) and of the withdrawn automatic pre-step (REQ-STARTUP-100): machine setup is re-runnable from Settings after first launch, whole or one step at a time, reading and updating `setup/state.json`, never re-running a completed step, taking the same lock, and reporting tool, command, exit status and reason inside that surface. Reconciles this domain with REQ-NOTIFY-265 and REQ-CONFIG-397 |
| REQ-STARTUP-154 | Settings surface for machine setup | Open question 20 — a degraded capability warns at the point it is exercised, not only in the settings card |
| REQ-STARTUP-155 | Cross-cutting invariants | Open question 1 — the three startup and setup timing bounds, and an explicit statement of what is deliberately unbounded |
| REQ-STARTUP-156 | Release pipeline | Open question 5 — the closed set of release-acceptance criteria, and the rule that externally owned behavior is never a gate. Also carries the platform-scope half of open question 9 |
| REQ-STARTUP-157 | Opt-in diagnostics | Open question 16 — the diagnostics files are a private, self-describing format: names implementation-chosen and stable within a schema version, units fixed |
| REQ-STARTUP-158 | Product identity | Fifth reconciliation round — carries the one-version-per-release rule that REQ-STARTUP-001 stated in ecosystem-packaging terms, with no claim about the form the product is packaged in or the channel it is published through |
| REQ-STARTUP-159 | Product identity | Fifth reconciliation round — carries the self-containment claim that REQ-STARTUP-012 stated in ecosystem terms, technology-neutrally: same platform baseline, same blocked network, same first paint, same true release version on the About surface, same run-time data assets resolving from what was installed |
| REQ-STARTUP-160 | Product identity | Sixth reconciliation round — carries, as behavior of the **application**, the network disclosure that withdrawn REQ-STARTUP-144 had placed on a public marketing website: what the product contacts, when, and what those requests never carry, presented on the About and Legal surface, readable with all outbound access blocked, and never behind a dismissal, a hover or a modal |

## Cross-domain reconciliations recorded here

- **REQ-CONFIG-397** fixes three field names in `setup/state.json`. REQ-STARTUP-071, which owns the
  record, now names `outcome`, `completed_at` and `versions` as fixed and declares the rest of its
  fields this domain's own — precisely the "unknown keys" that requirement tells its reader to
  ignore rather than reject. REQ-STARTUP-102 now reads the file on the terms REQ-CONFIG-397 fixes,
  including that an unreadable or malformed file reads as no record at all and is not an error.
- **REQ-NOTIFY-265** places a per-step, re-runnable setup surface in Settings that reads and updates
  the resumable state this domain owns. REQ-STARTUP-153 is the answering requirement and states what
  that surface lists, what a single-step run does, how it takes the setup lock, and how the record is
  updated afterwards.
- **REQ-SHELL-163** owns the diagnostics preference keys `diagnostics/level` and
  `diagnostics/outputDir` and points at REQ-STARTUP-131 for the default location. REQ-STARTUP-129 now
  reads exactly those two keys and no environment variable; REQ-STARTUP-146 and REQ-STARTUP-147 were
  updated to match, and the diagnostics environment variables were removed from Data & Formats.
- **REQ-SHELL-021 / REQ-SHELL-119** fixed the three-gate order for workspace switching and window
  close. REQ-STARTUP-053 adopts that order rather than stating a second one.
- **REQ-MCP-033** fixes the reserved bundled-runtime token and the self-launch mechanism.
  REQ-STARTUP-002 and REQ-STARTUP-015 defer to it instead of naming a third-party server and
  inventing a flag of their own.
- **REQ-CONFIG-181 / REQ-MCP-010 / REQ-CONFIG-465** leave third-party package identities to the
  implementation and give a tool-server entry an `enabled` field. REQ-STARTUP-059 drops the draft's
  literal package name and version and keeps only the agreement rule; REQ-STARTUP-064 excludes
  disabled entries from warm-up planning.
- **REQ-UIBENCH-110 / REQ-UIBENCH-111** already carry the benchmark as a built-in desktop
  capability, which is why REQ-STARTUP-002 could drop the benchmark console script without needing a
  rescue of its own.
- **REQ-CONFIG-269 / REQ-CONFIG-396** place the machine-setup card in the `project` settings
  category; REQ-STARTUP-101 and REQ-STARTUP-153 cite that category rather than naming a new one.


> ## Corrective amendment, 2026-09-02 — domain 11's side of ESC-24
>
> *Made by the sweep pass as a correction of a contradiction between two amended domains, and recorded
> separately from the `REQ-STARTUP-145` amendment above.*
>
> `REQ-SHELL-169` (ESC-24) requires a launch arriving while this instance is shutting down to be refused,
> answered, and honoured once the shutdown has finished. Three requirements of this domain contradicted
> it as written, and one of the three would have defeated it outright.
>
> **`REQ-STARTUP-164`, and this is the one that mattered.** Clause (3) reclaimed the instance record
> where the hand-over went unacknowledged for 5 seconds, listing "a process that is running does not
> answer" among its triggers. A refusal **is** an answer, but it is not an acknowledgement of the
> hand-over, so on the literal reading a launch refused one second into a thirty-second force-exit
> allowance would reclaim the record at second five and become the second simultaneous instance ESC-24
> was ruled to prevent. Neither requirement was individually unsatisfiable, and no test in either domain
> would have caught it. The clause now states that an instance which answers is not an instance that does
> not answer, that the 5 seconds are not applied to a refusal, that the record is not reclaimed, that the
> launch waits instead, that the wait is bounded by the force-exit allowance `REQ-MONITOR-131` carries
> and of which this domain holds no copy, and that the deferred launch re-enters the resolution order at
> clause (1) with its full complement of attempts once the record is released — resolving a record the
> shutdown left behind exactly as the clause already resolves one naming a process that is no longer
> running.
>
> **`REQ-STARTUP-162`, twice.** Its clause requiring an instance that holds the record but has no window
> open to **build and show** a main window is precisely what ESC-24 identified as wrong, and
> `REQ-SHELL-169` forbids it from its side only; that clause now carries its single exception. Its
> silence rule — "no surface anywhere in the product reports that a launch was refused" — is scoped to a
> launch that has been handed over and has **ended**, which is what it was always about, and a new
> paragraph fixes what a refused-and-waiting launch shows. `REQ-SHELL-169` states in terms that this
> surface is domain 11's to fix and deliberately does not fix it, so until this amendment the obligation
> to tell the user existed and the thing that tells them did not.
>
> **`REQ-STARTUP-161`.** Its closure — "every launch resolves to exactly one of two outcomes and to no
> third" — is still true, because a refused launch eventually becomes the instance or is handed to a
> successor. Read literally it nonetheless reads as forbidding the wait. It now states that the set of
> outcomes is closed while *when* a launch reaches one is not fixed there, and that waiting is not a
> third outcome. The Data & Formats constant for the hand-over wait is qualified in the same way: the 5 s
> bounds an **unanswered** hand-over, not a refused one.
>
> **What was deliberately not done.** `REQ-STARTUP-121`'s update restart needed no amendment.
> `REQ-SHELL-169` relies on it — the record **passes** to a successor rather than being released, so a
> refused launch is handed to the successor rather than becoming the instance — and its own "SHALL never
> start a third process" holds unchanged. A reciprocal cross-citation from the update-restart side would
> make the interaction visible from there and is a nicety rather than a contradiction; it is reported
> rather than made.
