# Open questions — Spikes, and the questions raised since (35 of 35)

Part 68 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-450 – OQ-458; OQ-378, OQ-459 archived in [the archive](../../archive/architecture/open-questions/68-spikes-and-later-questions-35.md).

- OQ-378 — Where no project file covers the workspace, what do the model's own reference search and safe symbol deletion do?; ruled 2026-10-21; [archived](../../archive/architecture/open-questions/68-spikes-and-later-questions-35.md#oq-378)

<a id="oq-450"></a>

**OQ-450 — What do REQ-STARTUP-014's bundle name and REQ-STARTUP-023's "no code signature" mean for the macOS ARM64 bundle?** *(REQ-STARTUP-014, REQ-STARTUP-022, REQ-STARTUP-023; `PD-STARTUP-001`, IC-3; ADR-0054, "Linux and macOS configuration prepared". Raised 2026-10-22 by preparing the macOS configuration under [R-080](../../product/requests.md#r-080), `apps/desktop/scripts/lib/platform-targets.mjs`. OQ-400 to OQ-449 are the Windows ARM64 session's range, so this takes the next number after it.)*

**What is open.** Two things.

- **(a) The bundle's name.** REQ-STARTUP-014 names the bundle `rotaris.app`, in lower case. electron-builder names a bundle after the product name, and the product name is `Rotaris` (`electron-builder.yml`'s `productName`, which also names the Windows artifacts' installed tree and what the platform shows). The only way to get a lower-case bundle is a macOS-only product name. That also changes the name the running application reports to the platform, and possibly the per-user directories REQ-STARTUP-145 derives from it. Neither effect is measured. Display keys such as `CFBundleDisplayName` could restore `Rotaris` where the user reads it.
- **(b) "No code signature" on Apple silicon.** REQ-STARTUP-023 says that no code signature is applied to the macOS artifacts. On ARM64 the platform refuses to run native code that carries no signature at all. An ad-hoc signature carries no identity and no notarization, so it is what an unsigned build has in practice. electron-builder's `identity: null` skips signing outright, while `identity: "-"` signs ad hoc. Whether an ad-hoc signature counts as "a code signature" under the requirement decides which of the two the build uses. It also decides whether REQ-STARTUP-023's disclosed Gatekeeper confirmation is the only obstacle on first launch, or whether the platform reports the bundle as damaged.

**What the preparation proceeds under.** For (a), electron-builder's default: the bundle is named after `productName` (`Rotaris.app`), which departs from REQ-STARTUP-014's spelling, and the identifier is `ai.rotaris.app` as the requirement says. For (b), `identity: null`, the requirement's literal reading. Both are inert. No macOS artifact may be produced under IC-3 or `PD-STARTUP-001`, and `build-hooks.cjs` refuses the platform.

**What decides it.** A ruling on each reading. Then a macOS ARM64 host (IC-3, spike 17) must show that a bundle built under the ruling launches from the disk image on an unmodified machine, and what the user sees on first launch.

<a id="oq-451"></a>

**OQ-451 — Where may a remote MCP entry's `headers` go when its server answers with a redirect to another origin?** *(REQ-MCP-001, REQ-MCP-020, REQ-MCP-043; ADR-0033. Raised 2026-10-22 by the dependency patch of [R-081](../../product/requests.md#r-081), which moves `@modelcontextprotocol/client` from 2.0.0 to 2.3.0 for GHSA-6prh-2h8m-c8cw. OQ-400 to OQ-449 are the Windows ARM64 session's range and OQ-450 is taken, so this takes the next number.)*

**What is open.** REQ-MCP-001 and REQ-MCP-020 give a remote entry a `url` and optional `headers`. REQ-MCP-043 hands both to the connection. None of them says what happens when the server at `url` answers with a redirect. Until this patch the SDK's transports followed any redirect and sent the request again, configured headers and body included, to whatever origin the server named; a credential in `headers` reached a host the person never configured. From 2.3.0 the SDK follows a redirect only when it keeps the request's origin (same scheme, host and port, or http to https on the same host with default ports) and its method. Any other redirect fails the request with an error naming the target. Two things are therefore unspecified:

- **(a) Whether a cross-origin redirect is ever followed.** A person whose server's address moved to another host now meets a connection failure where before they met a working connection. The SDK offers `redirectPolicy: 'follow'` to restore the old behaviour, and the product does not set it.
- **(b) What the person is told.** The SDK's error names the target. The product reports it as it reports any other connection failure (REQ-MCP-042's discovery warning, REQ-MCP-092's `unreachable`, REQ-MCP-107's diagnostic), and nothing in the specification says the redirect is named as a redirect or that the configured `url` should be changed to the target.

**What the build proceeds under.** The SDK's default. A remote entry's `headers` go to the origin of its `url` and nowhere else. A cross-origin redirect is not followed, and the connection fails with the SDK's message. `packages/mcp/src/client.test.ts` holds it for both transports: a second origin receives nothing. On 2.0.0 the same cases fail, with the second origin receiving `x-auth`.

**What decides it.** A ruling on (a) and (b). If the ruling keeps (a), a person moved off a redirecting address needs to read the target from the failure, so (b) may want the notice to name it.

<a id="oq-452"></a>

**OQ-452 — Does the Rust standard library compiled into the portable's launcher stub owe an entry in the notices file?** *(REQ-STARTUP-142, REQ-STARTUP-143, IC-7; ADR-0054 P4, consequence 5. Raised 2026-10-23 by building the stub under the packaging brief of that day. OQ-450 and OQ-451 are taken, so this takes the next number.)*

**What is open.** The portable is the stub (`apps/desktop/launcher`) with the payload appended. The stub links no crate, but every Rust binary carries the compiler's standard library — `std`, `core`, `alloc` and the compiler builtins, licensed MIT OR Apache-2.0 — statically. REQ-STARTUP-142 asks for "one entry for every dependency present in the shipped artifact" and excludes "any component of the product's own build". The standard library is present in the artifact and is not the product's own code, so the literal reading lists it; the notices generator (`tools/notices/`) reads `node_modules` and the code-intelligence runtime and knows nothing of a Rust toolchain. The installer does not carry the stub, so the question is the portable's alone.

**What the build proceeds under.** No entry: the generator is unchanged. The stub depends on nothing else, on purpose, so the standard library is the whole of the question.

**What decides it.** A ruling on whether the standard library is a dependency in REQ-STARTUP-142's sense. If it is, the generator gains an entry naming the toolchain's version (`rustc --version` on the packaging host) with both licence texts, and REQ-STARTUP-143's validation must fail a portable built without it.

<a id="oq-453"></a>

**OQ-453 — Where are superseded preparations reclaimed: by the application after its window is shown, or by the stub after it has started the application?** *(REQ-STARTUP-165 (b), REQ-STARTUP-043; ADR-0054, "Reclaiming superseded preparations". Raised 2026-10-23 by building the stub.)*

**What is open.** ADR-0054 places reclamation in "a run started from a preparation … after the window is shown and off the critical path". The application has no code for it, and the brief that built the stub excluded product logic outside packaging. The stub reclaims instead, right after it has started the application and before it exits: every directory of another token that carries a marker and that nothing runs from, and every `.stale-…` displacement; `.incomplete-…` and `.run-…` trees only when a day old, since another launch may be writing or running one. "Nothing runs from it" is decided on Windows by renaming the tree aside first — the rename fails while any of its files is open — and on Linux by reading `/proc/*/exe`. Both placements keep it off the paint path, but the stub's competes with the application's own start for the disk for the ~90 ms ADR-0054 measured per deleted payload, and the record's reading put it after the window.

**What the build proceeds under.** The stub reclaims, as above. `pnpm portable-proof` A3 and A5 measure it: no `.stale-…` left after a redo, and a superseded preparation removed after the next artifact starts.

**What decides it.** A ruling on the placement. If the record's placement stands, the stub's `reclaim` moves to a post-show step of main (ADR-0055's order), which must then also read the marker for clause (c)'s notice.

<a id="oq-454"></a>

**OQ-454 — Does an update through the assisted installer show its pages, or install silently?** *(REQ-STARTUP-017, REQ-STARTUP-125, REQ-STARTUP-120; ADR-0054. Raised 2026-10-23 by making the installer assisted.)*

**What is open.** The installer strategy starts the verified setup with no argument and quits (`applyInstaller`, `apps/desktop/src/main/updater/strategies.ts`). With the one-click installer that was a silent install into the same place. The assisted installer instead opens its pages — Welcome, Directory (pre-filled with the installed directory), Install, Finish with "Run Rotaris" checked — so a user who pressed `Update now` meets a setup wizard and could move the installation. REQ-STARTUP-017 states both forms, interactive and silent (`/S`, no pages, never auto-launch), and REQ-STARTUP-125 says only that the installer is started as a process that survives the application. Neither says which form an update takes; a silent update would also need the application restarted by something, since `/S` never auto-launches.

**What the build proceeds under.** Unchanged: the setup is started with no argument, so an update shows the assisted installer's pages, its directory page offering the installed directory.

**What decides it.** A ruling on the form. Silent would mean `applyInstaller` passing `/S` (and `/D=` the installed directory) and a decision on who starts the updated application afterwards.

<a id="oq-455"></a>

**OQ-455 — Does the composer carry a microphone, and what are its states?** *(REQ-CHAT-001, REQ-CHAT-007, REQ-SHELL-135; PD-CHAT-001. Raised 2026-10-30 by [R-089](../../product/requests.md#r-089).)*

**What is open.** No requirement names dictation. PD-CHAT-001 states "The strip SHALL carry every input control the composer draws", then lists them, and a microphone is not in the list.

**What the build proceeds under.** A strip action (`StripActionButton`) between Attach and Stash, enabled in every run state as Stash is (REQ-CHAT-006), reading idle, recording or transcribing. Each state is its icon, its accessible name, its tooltip and a polite live announcement; a second press while recording stops it; a press while transcribing does nothing and says why; every refusal reason takes REQ-CHAT-007's two channels. The recording pulse stops under reduced motion (REQ-SHELL-135). A recording stops itself after 5 minutes. The list in PD-CHAT-001 is read as naming what existed, not as closing the strip.

**What decides it.** A ruling on the control, and on whether PD-CHAT-001 gains the microphone by a revision.

<a id="oq-456"></a>

**OQ-456 — Where does a transcript land?** *(REQ-CHAT-001, REQ-CHAT-003, REQ-CHAT-014, REQ-SHELL-159, REQ-CHAT-017. Raised 2026-10-30 by R-089.)*

**What is open.** Text can change while a transcription runs, since typing is not blocked, and no requirement says which caret applies or how the text meets its neighbours.

**What the build proceeds under.** The caret when the transcript arrives. A selection is kept and the text goes after it, because a dictation never deletes. One space is added where the text would otherwise touch a non-space. A transcript arriving after the composer left the screen goes to the end of the stored draft. The composer takes focus and the draft publishes as for typing; the microphone never submits and records no history entry. An empty transcript inserts nothing and says so.

**What decides it.** A ruling on the caret and on the selection.

<a id="oq-457"></a>

**OQ-457 — What configures the dictation model?** *(REQ-CONFIG-040, REQ-CONFIG-268, REQ-CONFIG-082..097. Raised 2026-10-30 by R-089.)*

**What is open.** No key exists, and a workspace's `agents.yaml` comes with the repository, so a key naming a program or a path would let a cloned repository choose what a press of the microphone runs.

**What the build proceeds under.** A Tier A top-level section, `dictation:`, edited in Settings › Models ([`PD-CONFIG-005`](../../product/directives/pd-config-005.md#pd-config-005)): `backend` (`off`, the default, `local` or `endpoint`), `local_model`, `base_url`, `model`, `provider` and `language`. There is no command key and no path key: `local_model` is a bare name, refused otherwise, resolved to `<name>.pt` under the Whisper cache, and the program is `whisper` from `PATH` or `~/.local/bin`. A model file that is absent is refused before anything starts, because the CLI would otherwise download it. Nothing is installed or downloaded. The run host reads none of it, so `TIER_B_RUNTIME_KEYS` does not change.

**What decides it.** A ruling on the keys and the default. `off` means the control starts refused, with a reason naming the setting.

<a id="oq-458"></a>

**OQ-458 — What may a dictation send, and where is that disclosed?** *(ADR-0030, REQ-STARTUP-160, REQ-SHELL-005, REQ-PROVIDER-057. Raised 2026-10-30 by R-089.)*

**What is open.** `backend: endpoint` sends the person's voice to a URL. REQ-STARTUP-160's disclosure "SHALL name no host, endpoint, or request this document does not require" and states only its three things, so it has no room for this, and its "never carry … prompt text" is scoped to those requests. A workspace file can state `base_url` and `provider` together, as a `models:` entry can.

**What the build proceeds under.** Only after the person presses the control, and only to the configured `base_url`. The bearer is the named provider's own credential, resolved in main through `ProviderService.lease`, never in the file, the snapshot or the renderer. The disclosure is left unchanged. Demo mode (REQ-SHELL-005) has no code to meet in the product as built; when it lands, the endpoint path must decline with it.

**What decides it.** A ruling on the disclosure, and on whether a workspace file may pair a `base_url` with a credential here when it may for a model.

- OQ-459 — What does the application grant the renderer's device requests?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/68-spikes-and-later-questions-35.md#oq-459)
