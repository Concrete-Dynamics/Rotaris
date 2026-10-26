# Architecture proposals — UI slice — ADR-UI-13 — Startup sequencing and the first-paint budget

Part 7 of 10 of [the ui proposal](../ui.md), which indexes every part.

### ADR-UI-13 — Startup sequencing and the first-paint budget

**Decision.** What runs before the first window exists, what runs before the first paint, what is
deferred, and how the bundling choice is kept from eroding the 5-second budget.

**Constraints that bear on it.** U1 (a fixed pre-window order; no network traffic from constructing a
window without showing it), U2 (one shared 650 ms deferral, one-shot and abandonable), U3 (5 s to
first paint on every artifact and every bundle mode; the empty-plan fast path inside 100 ms),
U16 (demo mode fixed at window construction), P1/P4 (preference scoping before the first read; theme
restored before the first window is visible), B6 (bundled fonts), REQ-WORKSPACE-141 (the full
workspace-open ordering), REQ-SHELL-013/REQ-STARTUP-044 (two mutually exclusive post-show schedules).

**Alternative A — a single renderer bundle loaded from `file://`, main process does the sequencing.**

*For:* simple; electron-vite's default output.
*Against:* nothing inherently, but it does nothing to help U3 either: the 5 s budget must hold for the
Windows `onefile` portable artifact, which self-extracts before the process even starts, and for an
AppImage, which mounts a squashfs. The budget is stated with *no per-flavour differential*, so the
slowest artifact sets the target and the renderer's own load time is the part we control.

**Alternative B — the same, plus an explicit paint-first discipline.** The window is created hidden,
loads a shell that paints the chrome and the default view from *stored* state only, and is shown at
`ready-to-show`; everything that could block is deferred behind the show.

*For:* it is what U1 already describes — preference scoping, icon, fonts, theme, then window, then
(and only then) repository discovery, the update check and cloud-credit polling. It also gives
REQ-STARTUP-050's "the complete default desktop SHALL be painted and visible before the modal chooser
opens" a mechanism rather than a hope, and it makes U1's "constructing a window without showing it
produces no network traffic" structurally true because every network path hangs off the show event.
*Against:* requires discipline about what the first paint depends on: any await on a workspace read,
a git probe, a provider catalogue or a session load moves into the deferred phase or the budget goes.

**Recommendation: Alternative B**, with these specifics.

- **The pre-window phase, in the main process, in this order** (U1): resolve the preference-store root
  and establish scoping (P1); set the application icon; register the bundled font families; read the
  stored theme. Only the first of these may touch disk on the critical path, and it reads one small
  file.
- **The first paint is rendered from stored preferences and constants only.** The seven views are
  constructed (which ADR-UI-03 needs anyway, for construction-time slot allocation), the rail, title
  bar and status strip are drawn, and the Workspace view shows its empty state. Nothing on this path
  awaits a workspace read, a git snapshot, a session load, a provider catalogue or a model list — the
  composer's model chip has a neutral loading label precisely because model options are not yet
  loaded (REQ-CHAT-009).
- **Post-show activation is a single ordered pipeline** (REQ-WORKSPACE-141): git refresh → update check
  → cloud-credit polling; then, once the window is interactive, initialization resolution and the
  hook-review notice; then, after the shared 650 ms deferral, the project chooser if it is still owed.
  The two mutually exclusive schedules of REQ-STARTUP-044 — bundled-first-run with machine setup, and
  everything else — are two branches of that one pipeline, sharing one delay (U2).
- **The 650 ms deferral is one timer owned by the window registry** (ADR-UI-05), cancelled on window
  close (REQ-STARTUP-045, REQ-SHELL-016) and abandoned unshown if the question it asks has already
  been answered (U2). It must not be re-implemented per offer — REQ-SHELL-011 is explicit that it is
  the product's single definition of the delay.
- **Fonts are preloaded and their load is awaited before the first paint** (`<link rel="preload">` plus
  `document.fonts.ready`), because REQ-SHELL-008 requires them available before the first paint and a
  late font swap would reflow the transcript and invalidate R3's measurement cache. In the live
  application a failure falls back to host fonts and continues; in a benchmark iteration it is a crash
  (B6). One loader, two failure policies.
- **Demo mode is a construction-time window parameter** (U16), carried from the palette entry through
  the window registry into the renderer's initial state; there is no runtime toggle and nothing is
  written to the preference store.
- **Budget protection is a measurement, not an intention.** Launch-to-first-paint is recorded in
  diagnostics as a span (REQ-STARTUP-140 already requires a `config.load` span), and the release gate
  of REQ-STARTUP-156 requires each published artifact to be downloaded and launched to first paint at
  least once on its own platform key — so the budget has both a continuous signal and a release check.

**Consequences accepted.** A hard rule that nothing may be awaited before `ready-to-show`, which is
easy to violate accidentally and needs a test that fails on a regression rather than a review
convention. The first frame is deliberately empty of workspace content, which is a visible design
consequence: the user sees the shell before they see their project.

**Revisit if.** Measurement on the slowest artifact (the Windows `onefile` portable, which
self-extracts) shows the 5 s budget cannot be met even with an empty first paint — the remedy would be
a bundle-mode change, and U4 makes the portable's single-file shape a hard requirement, so the
conversation would be about the budget or about what is bundled.

---

### ADR-UI-14 — Markdown rendering and the bounded render cache

**Decision.** How agent-message bodies are turned into rendered content, and how the cache the
benchmark reports is structured.

**Constraints that bear on it.** R11 (synchronous, no network request, partial mid-stream input
renders without error and without affecting neighbouring rows, character-exact pointer selection),
R3 (rendering reused only while identity, content, width and expansion state are unchanged; live rows
never reused), R4 (`max_entries` 256, `max_chars` 2,000,000 counted in *source* characters,
`hits`/`misses` cumulative for the process), R1/S6 (200 ms budget with rows still streaming),
B3 (deterministic across processes), REQ-CHAT-056 (fenced code in a monospace face on its own shaded
background, bold heavier, italic slanted, inline code monospace, links in a distinct colour),
REQ-NOTIFY-243 (streaming Markdown renders partial input as readable text and resolves to the correct
final rendering once the remainder arrives).

**Alternative A — a Markdown-to-HTML library plus `dangerouslySetInnerHTML`, sanitised.**

*For:* fast, simple, one dependency, and HTML gives R11's native text selection.
*Against:* it hands model-authored text to an HTML parser. Sanitising is a mitigation, not a
guarantee, and the same content is also rendered in the persona window and copied to the clipboard.
It also makes R3's cache key awkward: an HTML string can be cached, but reuse must still be gated on
the laid-out width because the rendering the specification talks about is *measured*, and an HTML
string is not.

**Alternative B — parse to an abstract syntax tree, render the tree to React elements, cache the
parsed tree.** No HTML string is ever produced and nothing is injected.

*For:* no HTML injection surface at all; the renderer emits only the element types we allow, which is
also how REQ-CHAT-056's enumerated treatments (fenced code, bold, italic, inline code, links) become
a closed list rather than a sanitiser's allow-list. Selection stays native because the output is DOM.
The cache holds parsed trees keyed by source text, and `chars` is naturally the count of source
characters R4 specifies. Parsing is synchronous and does no I/O (R11).
*Against:* a tree-to-elements renderer is ours to write and to keep in step with whatever subset of
Markdown we support; a parser that produces an AST is slightly slower than one that streams straight
to a string.

**Alternative C — pre-render bodies in the main process and ship rendered output over IPC.**

*For:* the renderer never parses; the cache is shared across windows.
*Against:* fails R3 outright — reuse is gated on the laid-out width, which only the renderer knows —
and would put rendering on the far side of the boundary from the 200 ms budget. It also moves the
injection surface rather than removing it.

**Recommendation: Alternative B.** Specifics:

- **Two caches, not one, matching R3's two kinds.** A *parse* cache keyed by source text (this is the
  one the benchmark reports as `markdown_cache`, with occupancy in entries and in source characters,
  bounded at 256 and 2,000,000, LRU); and a *measurement* cache keyed by R3's full four-part key
  (identity, content, laid-out width, expansion state) holding the row's measured height. The
  specification's "retained row renderings" maps to the parse cache plus React's own element reuse;
  its "retained row measurements" maps to the measurement cache. Keeping the parse cache keyed on
  source text alone is what makes R4's `chars` figure meaningful and comparable to `max_chars`.
- **Live rows bypass both caches** (R3): a row that is still streaming is re-rendered every repaint,
  which is also why R4's `hits`/`misses` grow during the streaming phase rather than staying flat.
- **Partial input is a first-class case, not an error path.** An unterminated fence, an unclosed
  emphasis run or a half-written link must render as readable text and must resolve to the correct
  final rendering when the remainder arrives (REQ-NOTIFY-243, R11). The parser must therefore be
  tolerant by construction rather than by try/catch, and the streaming phase of the benchmark
  (prefixes at 0, 256, 512, …) exercises exactly this.
- **Links are rendered as elements that request an external open through the command channel**, never
  as navigable anchors — the renderer is sandboxed and must not navigate. Bare URLs are linkified by
  the renderer with trailing punctuation excluded (R11), which is a post-parse text transform applied
  to text nodes only, so it can never turn part of a code span into a link.
- **Determinism (B3):** the parser and the linkifier must not depend on locale, on `RegExp` behaviour
  that varies with Unicode data versions in a way we cannot pin, or on iteration order of an object.
  The benchmark's `LANG=C` environment will expose a locale dependency rather than hide it.
- **Copy uses the row's source text, not the rendered output** (REQ-CHAT-075's "Copy message" is the
  row text), and a group's copy yields the summary form, never raw tool input or output
  (REQ-CHAT-065).

**Consequences accepted.** We own a Markdown subset and its renderer; the supported subset must be
written down, because REQ-CHAT-056 enumerates treatments but not the grammar. The parse cache is a
reported figure, so changing its keying changes a benchmark output and should be treated as a
behavioural change rather than an internal one.

**Revisit if.** The parse cost at the 200 ms budget with many streaming rows proves too high, in which
case the answer is incremental parsing of the changed tail rather than moving the work.

**Open question.** No requirement fixes *which* Markdown dialect is rendered. REQ-CHAT-056 names five
treatments and requires links to be activatable; nothing says whether tables, task lists, block
quotes, headings or images are supported. This needs answering — probably by the design reference,
since it is as much a visual question as a functional one — before the renderer's element list is
fixed. Images in particular interact with REQ-CHAT-056's "MUST NOT issue any network request".

---

### ADR-UI-15 — The renderer build toolchain

**Decision.** What builds the main, preload and renderer bundles during development and for release.

**Constraints that bear on it.** T1 (one shipped executable, so the build must not emit a second entry
point), B4/B5 (the very same build must run as an offscreen child process with no on-screen output),
B6 (fonts and theme resolved from the package, never the host, so assets must be genuinely bundled),
U3 (5 s to first paint, which bounds bundle size and load work), U4 (four artifacts), ADR-UI-02's
sandboxed preload (which must be a single self-contained script, since a sandboxed preload cannot use
CommonJS `require` of arbitrary modules).

**Alternative A — electron-vite.** A Vite-based toolchain with three configured targets (main,
preload, renderer), hot module replacement in the renderer, and conventional handling of the preload
sandbox constraint.

*For:* it is built for exactly this three-target shape; Vite's dev server gives fast renderer
iteration, which matters for a UI slice this large; it composes with electron-builder for packaging
(ADR-UI-12) rather than competing with it; the preload target can be emitted as a single bundled file,
which is what a sandboxed preload requires.
*Against:* an extra abstraction over Vite whose configuration surface must be understood; a dev-mode
renderer served over HTTP rather than `file://`, which differs from production in exactly the axis
(origin, CSP) where mistakes are expensive — so the CSP and the sandbox settings must be verified
against a packaged build, not a dev build.

**Alternative B — plain Vite with hand-written build scripts for main and preload.**

*For:* nothing hidden; one fewer dependency.
*Against:* re-implements what electron-vite provides, including the preload bundling rule and the
dev/production asset-path difference. No requirement is served better.

**Alternative C — Electron Forge with the Vite plugin.**

*For:* one tool for build and package; first-party.
*Against:* couples the build to Forge's packaging, which ADR-UI-12 rejected in favour of
electron-builder for U4's artifact shapes. Mixing Forge's build with electron-builder's packaging is
the worst of both.

**Recommendation: Alternative A (electron-vite), with electron-builder for packaging.** The candidate
stack's suggestion holds here, and it holds for a specific reason: the three-target shape and the
sandboxed-preload bundling rule are the two things this build must get right, and they are exactly
what electron-vite is for.

Specifics:

- **Three targets, one renderer bundle reused by every window.** The main, persona, terminal and
  benchmark-iteration windows all load the same renderer bundle with a different initial route and
  window role, so B4's "the same rendering path the live application uses" is true by construction
  rather than by discipline. A separate benchmark bundle would violate it.
- **Assets are bundled, not fetched.** Fonts, the brand mark, icons, the third-party licence bundle
  and the build-identifier file are packaged (REQ-STARTUP-159 requires every run-time data asset to
  resolve from what was installed, with no download, under blocked network).
- **A strict Content-Security-Policy with no `unsafe-inline` and no remote origins**, consistent with
  R11's "rendering MUST NOT issue any network request" and REQ-SHELL-139's "the About page renders
  exclusively from local data — zero network requests at render time". The CSP is a mechanism that
  makes those two checkable rather than merely intended.
- **The renderer must be verified in a packaged build** for the paths where dev and production differ:
  asset resolution, CSP, sandbox, and font loading. That verification belongs in the release gate of
  REQ-STARTUP-156, which already requires each artifact to be launched to first paint.

**Consequences accepted.** A toolchain dependency in the critical path of every build; dev/production
divergence that must be actively tested rather than assumed away.

**Revisit if.** The bundle size threatens U3's 5 s budget on the slowest artifact, or if a future
requirement needs a second renderer entry point with genuinely different capabilities.

---
