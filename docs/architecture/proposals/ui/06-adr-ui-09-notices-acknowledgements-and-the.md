# Architecture proposals — UI slice — ADR-UI-09 — Notices, acknowledgements, and the recovery surfaces

Part 6 of 10 of [the ui proposal](../ui.md), which indexes every part.

### ADR-UI-09 — Notices, acknowledgements, and the recovery surfaces

**Decision.** Where the notice store lives, how single-slot replacement and total ordering are
enforced, and how the acknowledgement stack is rendered.

**Constraints that bear on it.** T2 (the notice store belongs to the process), N1–N11, S3 (persist
before publish, which N3's record-before-render mirrors), T4 (a window is re-created during a
workspace switch and must render whatever notice is current), T5 (secondary windows render their own
banner), A5 (motion tokens and reduced motion).

**Alternative A — renderer-owned notice state.** Each window keeps its own notice slot; the main
process forwards publication events.

*For:* rendering is local; no boundary crossing to read the current notice.
*Against:* fails T2 twice over. Identifiers must be unique across every window of the process and
monotonic across window re-creation, which a per-renderer counter cannot provide. And a window
re-created within one process must render whatever notice is current, which requires the notice to
have outlived the previous window. It also makes N2's total ordering a distributed problem.

**Alternative B — a single notice store in the main process; renderers render a projection of it.**

*For:* T2 falls out. Total ordering (N2) becomes a single-threaded queue in one place: accept, assign
identifier, apply clearing rules, record if warning or error (N3), then publish. N7's scoping rules
are evaluated once, by the owner, rather than N times by N windows with N views of which session is
focused. N3's "recording precedes rendering" is enforceable because recording and rendering are on
opposite sides of a boundary and the recording side goes first.
*Against:* a publication crosses the boundary before it is seen, adding latency to a surface that is
often the report of a failure. In practice this is one small message and is well inside the 100 ms
gesture budget.

**Recommendation: Alternative B.**

Specifics:

- **One notice store per application process**, holding at most one current notice (N2), with a
  monotonically increasing identifier that is never reset while the process lives. `clear(id)` is a
  compare-and-clear: it removes the current notice only if the identifiers match (N2/REQ-NOTIFY-026),
  so dismissing a superseded notice leaves its successor standing.
- **Publication is a serialised queue, not a callback.** N2 requires publications to be "applied one at
  a time and in the order they were accepted, each one assigned its identifier and its clearing rules
  applied before the next is accepted, so no two publications interleave". That is a queue with a
  single consumer. Several publications in one turn of the loop all get applied, the last one wins on
  screen, and painting may coalesce — the absence of an intermediate frame is explicitly allowed.
- **The record-then-render order of N3 is the queue's first step**, before the identifier is even
  handed back, so a notice superseded within the same turn is still recorded to the session timeline
  or to application diagnostics.
- **The acknowledgement stack is per window** and is *not* the notice store: N1 makes it a
  window-content-area-anchored surface, so each window that raises one owns its own stack of at most
  three. Its lifetimes, widths, motion and glyphs are all fixed figures and should be a single shared
  component consumed by the main, persona and terminal windows alike (REQ-SHELL-146 sweeps auxiliary
  windows independently).
- **The channel-choice rule of N4 is enforced at the call site by types, not by convention.** A
  failure, a refusal, or an outcome carrying a recovery action is published through a function that
  raises both surfaces; anything else goes through the acknowledgement-only function. Making these two
  different functions is what stops a refusal from being reported as a toast that disappears —
  REQ-NOTIFY-178 calls that out as an explicit failure mode.
- **The action vocabulary of N6 is a closed discriminated union carrying its parameter**, and the
  dispatcher refuses an action naming a view, settings category or library tab outside the owning
  domain's vocabulary. Because the vocabularies belong to other domains (REQ-SHELL-023,
  REQ-CONFIG-269, REQ-LIBRARY-103), they are imported rather than restated — an action type that
  restates a category list would drift.
- **Status vocabularies (N8) are imported types, never string literals at a call site.** The
  normalisation of REQ-NOTIFY-049 — fourteen persisted values onto nine presentation members, with a
  catch-all reachable only from a foreign version — is one total function, written once, with a test
  per arm. No surface may see a raw persisted status.
- **The two motion figures and the reduced-motion rule are theme tokens read at animation start**
  (A5), never cached, so flipping the OS setting while running takes effect.

**Consequences accepted.** Notices cross the boundary. The recovery dialogs of REQ-NOTIFY-072 to
REQ-NOTIFY-080 and the quota-wait surface of REQ-NOTIFY-263 stay in the renderer as ordinary
components fed by the session snapshot — only the *notice* is centralised, not every failure surface.
The temptation to let a component publish a notice directly must be resisted, or N2's ordering
guarantee is lost.

**Revisit if.** A requirement appears for more than one notice on screen at once — REQ-NOTIFY-181's
per-requirement standing banners are close to that, and belong to the requirements board rather than
to the shell banner slot; if that boundary moves, the single-slot store is what changes.

---

### ADR-UI-10 — The terminal grid and the fan-out of one stream to three views

**Decision.** What provides the terminal screen model and its rendering, how input is gated, and how
one stream is shown identically in three places.

**Constraints that bear on it.** X1–X11, T5/T6 (the terminal window is one per main window, hidden
windows do no work), A6 (cell geometry re-measured on theme change and re-reported), S8 (250 ms
live-row refresh while a terminal stream is live; 120 ms terminal-window header refresh), R13 (an
unsettled live terminal row never folds).

**Alternative A — xterm.js with its default input and link handling.**

*For:* a mature VT parser, a correct screen model including the alternate screen (X1), per-cell
attributes and reverse video (X9), and a fast renderer.
*Against:* as configured by default it *is* the input path — it attaches key handlers and writes
sequences to whatever is attached. X2 forbids a keystroke reaching the process until take-control is
armed; X3 forbids inventing any sequence for a key outside a closed vocabulary; X8 fixes wheel
scrolling at exactly 3 rows per notch with fractional accumulation, which is not xterm.js's own
`scrollSensitivity` behaviour. Adopting the defaults would fail three hard constraints quietly.

**Alternative B — xterm.js used as a *screen*, with the product owning input entirely.** The emulator
receives bytes and maintains the grid; every key event is intercepted before xterm.js sees it, and
what reaches the process is produced by our own encoder implementing X3's closed vocabulary.

*For:* keeps the hard part (VT parsing, alternate screen, wide characters, per-cell attributes) and
replaces exactly the parts the specification fixes differently. X2's arming gate, X3's
transmit-nothing-for-unknown-keys rule, X7's priority ordering and X8's wheel arithmetic all become
our code, which is where the requirements put them. Theme integration is straightforward: the 16 ANSI
colours are theme tokens (X9) and the cell geometry derives from the theme's monospace face (X7).
*Against:* we are fighting a library's defaults, which needs discipline — `attachCustomKeyEventHandler`
returning false for everything, no `onData` wiring to the backend, our own wheel handler, our own
selection-to-text extraction to satisfy X8's right-trim-and-newline-join rule.

**Alternative C — our own VT parser and grid.**

*For:* total control; nothing to fight.
*Against:* a VT parser is a deep, adversarial surface — the bytes come from arbitrary programs. Getting
the alternate screen, scroll regions, wide/combining characters and attribute handling right is a
project of its own, and X11 demands demonstration against a real pseudo-terminal with full-screen
programs repainting without corrupted cells. Not worth it.

**Recommendation: Alternative B.** Specifics:

- **One screen model per stream, in the renderer that owns the main window**, fed by the ordered
  frames of X5 with their sequence numbers. Metadata frames are idempotent; a frame whose sequence has
  been applied is dropped. This is the mechanism behind X5's "no line is ever shown twice" when
  retained and fresh output arrive together.
- **Three views over one model, not three models.** The transcript preview, the persona-window card
  and the pop-out grid all render from the same screen state. X4 requires identical visible cells at
  the same time and allows the persona card to lag by at most one refresh interval, which the shared
  model gives for free; three independently fed emulators would make it a race. The persona window is
  a separate renderer, so it receives the *screen state* (a serialised snapshot of the visible cells
  plus the metadata flags), not the raw byte frames — that keeps one parser and satisfies X4's
  "identical cells" claim by construction rather than by hoping two parsers agree.
- **Input is gated in three layers**: the grid's key handler implements X7's five ordered rules; the
  arming state decides whether anything is transmitted at all (X2); the encoder implements X3's
  closed vocabulary and transmits nothing for an unmapped key. The encoder is a pure function with a
  table, and it is shared with the agent's own input path (the Data & Formats section of domain 12
  says the vocabulary is shared), so there is one table and one test suite.
- **Geometry is reported only when it changes and only while visible and meaningfully laid out**
  (X7). This is a real hazard with a virtualised or hidden panel: a zero-height or placeholder-size
  measurement must never be reported, or a running full-screen program has its screen shrunk and its
  output discarded. The reporting path needs an explicit "is this a real layout" guard, and the
  re-measure on theme change (A6) must go through the same guard.
- **Execution is never throttled by display** (X6). Because frames are consumed by the model rather
  than by a renderer, a slow or absent view cannot apply back-pressure. When repaints cannot keep up,
  the model still ingests every frame in order and the view simply paints the latest state. This is the
  same shape as S10's rule for the transcript and should be implemented the same way.
- **Audit logging (X10) happens on the input side, in the main process**, one entry per submitted
  line, with the pending buffer flushed by a control sequence, navigation keys unlogged, and both the
  line and the command context passed through the shared redaction pass before writing. It must not be
  possible for the renderer to write the audit log directly.
- **The pop-out window's own lifecycle** follows T5/T6: closing it stops its ticking, the previews keep
  streaming, and the next open rebuilds it fresh (REQ-SHELL-086) — note the deliberate difference from
  the persona window, which hides rather than rebuilds.

**Consequences accepted.** We own the input path, the wheel arithmetic, the selection extraction and
the encoder, and we must keep them from drifting back to library defaults during upgrades. Serialising
screen state to the persona window costs a message per refresh interval; at 120 ms coalescing
(REQ-SHELL-076) for a bounded grid that is acceptable, but it is a real cost that a single-window
design would not pay.

**Revisit if.** X4's cell-identity requirement can be met more cheaply by shipping byte frames to the
persona renderer and accepting two parser instances — that would need evidence that two instances fed
the same bytes are cell-identical, which is a stronger claim than it looks.

---

### ADR-UI-11 — Theming, design tokens, and how the accessibility floors are actually enforced

**Decision.** How the three built-in themes are expressed, applied and verified, and where the
contrast floors are enforced.

**Constraints that bear on it.** A1 (contrast settled from rendered pixels), A2 (lightness-only
correction), A3 (no state by colour alone), A6 (a theme change recolours everything including native
surfaces and re-measures cell geometry), A7 (icon rasters and multi-monitor scaling), A8 (focus rings
within bounds), P4 (theme committed at the moment it is made), B6 (the benchmark uses `rotaris-dim`
from the package), REQ-SHELL-129 (token groups and declared metrics), REQ-SHELL-133 (each theme
declares a label and a one-line description).

**Alternative A — CSS custom properties on a root element, one stylesheet per theme.**

*For:* the native mechanism; a theme switch is one attribute change and the whole tree recolours,
which is A6's requirement for our own surfaces. Cheap, no re-render, works in every window.
*Against:* it puts token *values* in CSS, where the runtime cannot read them to perform A2's
lightness-only correction or A1's contrast checks, and where the benchmark cannot assert that
`rotaris-dim` was applied. It also cannot express REQ-SHELL-129's non-colour declarations (spacing,
radius, size, typography, motion, elevation, and the declared shell metrics) in a form the layout code
can read — REQ-SHELL-029's rail width, for instance, is derived from the theme *and* must widen when
labels do not fit, which is arithmetic, not styling.

**Alternative B — themes as data in TypeScript, projected to CSS custom properties at apply time.**
Each theme is an object declaring its light/dark flag, its token groups, its declared metrics, its
label and its description; applying a theme computes any derived colours, runs the contrast
corrections, and writes the resulting values as custom properties on every window's root.

*For:* the runtime owns the values, so A2's lightness-only correction is a function over the theme
object; the declared metrics of REQ-SHELL-129 are readable by layout code; a theme's label and
description (REQ-SHELL-133) live with it; the benchmark can assert which theme is in force. A theme
switch is still one attribute-and-properties write, so A6's "no widget retains a colour from the
previous palette" holds by construction.
*Against:* two representations to keep in step (the object and the emitted properties), and a
build-time discipline that no component may hard-code a colour.

**Recommendation: Alternative B.** Specifics:

- **Derived colours are computed, not authored.** A2 fixes the correction: raise perceptual lightness
  only, preserve hue and saturation, adjust upward only, cap near white. That is one function used by
  persona shades, chips, and the four slash-highlight roles of REQ-CHAT-027 — which additionally must
  all differ from one another after correction, so the function's caller must check pairwise
  distinctness rather than correcting each in isolation.
- **Contrast is asserted twice, at two different strengths.** A *static* check over the theme objects
  catches the ordinary case cheaply and can run in CI. But A1 is explicit that the real criterion is
  rendered pixels: "a token pair that computes correctly but paints over a different surface fails".
  So the acceptance evidence must be a screenshot-sampling pass over the seven views and every tab
  page in each built-in theme, sampling the rendered label against the rendered background. That pass
  is a deliverable of this slice, not an afterthought — REQ-SHELL-160 says a build that cannot
  demonstrate all four of its properties does not meet the accessibility contract.
- **`nativeTheme.themeSource` is set from the theme's light/dark flag**, and `color-scheme` is set on
  the document, which is what makes Chromium's own caret, scrollbars, form controls and menus follow
  the theme (A6). See the open question in ADR-UI-05 about the limits of this for host-owned dialogs.
- **Icons are vector, drawn from a single sprite or per-icon components, and inherit `currentColor`.**
  This satisfies A7's raster rule trivially (there is no raster), A6's "no stale-theme icon colour
  survives a switch", and REQ-SHELL-030's two distinct inks for resting and selected rail icons with a
  3:1 floor. The multi-monitor and 100–200 % scaling evidence A7 demands is then a rendering check
  rather than an asset-inventory check.
- **Focus rings are drawn inside the control's own bounds** (A8) — `outline` with a negative offset, or
  an inset `box-shadow` — never an outline that overflows, because REQ-SHELL-148 requires no part of
  the ring to be cut off on self-painted controls and divider handles.
- **Reduced motion is a value read at each animation start** (A5), resolved by the precedence of
  REQ-SHELL-135. Concretely: not a CSS `prefers-reduced-motion` media query alone, because the stored
  in-app setting outranks the OS and the OS signal must be re-read rather than cached. The resolved
  value is a store field; animations read it when they start.
- **Theme commit is synchronous and fsynced** (P4, ADR-UI-06), and reading a stored theme never writes
  it back, so an unrecognised name degrades to the default with the stored value untouched
  (REQ-SHELL-009, REQ-SHELL-128).

**Consequences accepted.** A rendered-pixel contrast harness is a real piece of test infrastructure to
build and maintain across three platforms and three themes. Every component must take its colours from
tokens with no exceptions, which needs a lint rule rather than a convention. A fourth theme is cheap
to add, which is the upside.

**Revisit if.** The design reference introduces a token model incompatible with the group structure
REQ-SHELL-129 declares — in which case the requirement, not the implementation, is what moves.

**Open question (design).** REQ-SHELL-129 fixes the default theme's shell metrics and token groups,
and REQ-SHELL-133 fixes what each built-in theme's description must convey, but the palettes
themselves are not specified anywhere I own. They come from the approved visual design reference.
Nothing above depends on the particular values; the mechanism is what is being proposed.

---

### ADR-UI-12 — Packaging, and how the application updates itself

**Decision.** What builds the four artifacts, and what performs the update check, verification and
apply.

**Constraints that bear on it.** U4 (four artifacts, exact names, one single-file artifact, per-user
Windows install, ARM64-only macOS, Ubuntu 24.04 AppImage baseline), U5 (deliberately unsigned),
U6 (one endpoint, undisableable), U7 (exact-name asset matching, `SHA256SUMS.txt` verification, no
signature), U8 (one naming scheme across publish, manifest and client), U9 (four flavour-specific
apply strategies, including macOS never being replaced automatically), U10 (nothing touched before a
verified download), U11 (Windows flavour from the installer's registry record), U12–U14 (invisible
check failure, visible install failure, in-place progress in one notice, one waved-off version),
T1 (one executable), U15 (clean shutdown, no partial or locked update file).

**Alternative A — electron-builder for packaging *and* electron-updater for updates.** The default
pairing.

*For:* it is the well-trodden path; NSIS per-user installer, portable exe, dmg and AppImage are all
first-class electron-builder targets, matching U4 exactly; electron-updater implements download,
verification and staged install for all four flavours.
*Against:* **electron-updater is unworkable against these requirements**, for several independent
reasons, each sufficient on its own:
  - It consumes its own metadata files (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`) and
    publishes `.blockmap` files alongside the artifacts. U8 requires that *every* filename a release
    publishes be a value of the single naming scheme of REQ-STARTUP-031, and REQ-STARTUP-035's release
    body carries "exactly one row per published asset except `SHA256SUMS.txt`". Extra published assets
    break both.
  - It verifies with the SHA-512 recorded in its own metadata, not against the `SHA256SUMS.txt` that
    U7 makes the sole verification source, and it expects code-signature validation on Windows and
    macOS, which U5 removes.
  - Its macOS strategy replaces the installed bundle via Squirrel.Mac. U9 requires the opposite: the
    installed bundle is left byte-for-byte unchanged and never replaced automatically; the disk image
    is mounted and revealed for the user to complete the move.
  - Its Windows differential update and its own flavour detection do not correspond to U11's
    registry-record discriminator or to U9's rename-to-`.old` portable strategy.
  - It supports channels and configurable feed URLs, which U6 forbids being reachable at all.

**Alternative B — electron-builder for packaging; a bespoke updater implementing U6–U14 directly.**

*For:* the update behaviour is fully specified, down to failure sentences, progress granularity, the
`.old` cleanup and the 1200 ms auto-close. A bespoke implementation is a direct transcription of
REQ-STARTUP-105 to REQ-STARTUP-128 rather than a fight with a library's assumptions. electron-builder
still earns its place: it produces exactly the four artifact shapes U4 requires, including the NSIS
per-user installer with `/S` and `/D=` (REQ-STARTUP-017), the registry writes of REQ-STARTUP-018, the
single-file portable, the ARM64 dmg with the `/Applications` symlink, and the AppImage.
*Against:* we own the updater, including its failure paths and its cross-platform file operations.
The Windows portable strategy renames a running executable — legal on Windows, but it and the AppImage
in-place replacement both need real testing.

**Alternative C — Electron Forge with custom makers, plus the bespoke updater.**

*For:* a cleaner plugin model and first-party maintenance.
*Against:* its NSIS/dmg/AppImage story is thinner than electron-builder's, and U4's requirements
(per-user install with no elevation, an exact artifact naming scheme, a `/Applications` symlink, an
Ubuntu 24.04 glibc baseline) are precisely where electron-builder's maturity pays. No benefit here to
offset the work.

**Recommendation: Alternative B.** Specifics:

- **electron-builder configured to emit exactly four artifacts and nothing else**, with `artifactName`
  templates producing `Rotaris-{v}-windows-x64-setup.exe`,
  `Rotaris-{v}-windows-x64-portable.exe`, `Rotaris-{v}-macos-arm64.dmg` and
  `Rotaris-{v}-linux-x86_64.AppImage`. Publishing must be off, so no `latest*.yml` or `.blockmap` is
  emitted (U8). `SHA256SUMS.txt` is generated by the release pipeline from the emitted assets, sorted
  by filename, two-space separator, never self-listed (U7).
- **The artifact naming scheme is one module shared by the build configuration and the updater**
  (REQ-STARTUP-031 says "a single authority shared with the updater"), so U8's agreement is
  structural. The updater's asset lookup is exact string equality against that module's output
  (U7) — no normalisation, no case folding, no `includes`.
- **The updater is a main-process module** with a strict sequence: fetch and parse `SHA256SUMS.txt` →
  stream the asset into a fresh `rotaris-update-` staging directory in 1 MiB chunks → verify → apply
  (U10, REQ-STARTUP-122, REQ-STARTUP-124). It reports progress into the *same* notice by identity,
  never by replacement (U13), at whole-percent or whole-MiB granularity with a final settle update.
- **Four apply strategies, selected by flavour** (U9, U11), each a separate function with its own
  rollback story. The macOS one mounts and reveals and *changes nothing*; that is worth a comment in
  the code, because it looks like an omission.
- **`app.isPackaged` is not sufficient for flavour classification.** U11 fixes the discriminator:
  `APPIMAGE` first, then the macOS bundle, then on Windows the `HKCU\Software\Rotaris\InstallDir`
  value *and* the running executable resolving inside the directory it names, everything else
  portable. Reading a registry value from the main process needs a small platform helper; this is one
  of the few places where a Windows-specific code path is unavoidable.
- **Electron's own `autoUpdater` is not used at all**, on any platform, and neither is any update
  feed other than the one endpoint of U6.
- **U6's undisableability is a property of the configuration surfaces, not of the updater.** The
  acceptance criterion is that four closed enumerations contain no entry naming update checking, an
  endpoint, a release source or a channel. ADR-UI-06's typed key registry makes one of those four
  checkable mechanically; the others belong to other slices, and the check should be a single test
  that reads all four registries.
- **Shutdown waits at most 5000 ms for in-flight update work** and leaves no partially written or
  locked file (U15); the staging directory is removed on both success and failure.

**Consequences accepted.** We own an updater, including its Windows and Linux file operations and
their failure modes; that is perhaps 600–900 lines plus tests, and it must be exercised on all three
platforms because U9's strategies share no code. Unsigned binaries (U5) mean the product will always
trip SmartScreen and Gatekeeper on first launch — a product decision already taken and disclosed, not
one to revisit here. Without differential updates every update is a full artifact download; at these
artifact sizes that is acceptable and U7's verification model assumes it.

**Revisit if.** The product ever acquires code signing, at which point signature verification becomes
possible and REQ-STARTUP-123's explicit note that "a matching digest establishes that the download is
the published file and nothing about who published it" would be worth revisiting as a requirement.

**Escalation — `ESCALATE`.** Not a technology choice, but a product one that this ADR sits on top of.
U5 makes unsigned binaries a deliberate decision, and REQ-STARTUP-123 states plainly that the update
path establishes *what* was downloaded and nothing about *who* published it, over the same connection
the download came from. The options are: (a) keep it as specified, disclosed in the release notes;
(b) add code signing for Windows and Apple notarization, which changes cost, release process and
REQ-STARTUP-021/023, and would make signature verification possible in the updater; (c) sign the
`SHA256SUMS.txt` manifest with a key shipped in the application, which is cheaper than (b) and gives
publisher authenticity for updates without changing first-launch OS warnings. This is the product
owner's call, not mine; I raise it because the architecture is materially different under (b) or (c)
and it is far cheaper to decide now than after the updater exists.

---
