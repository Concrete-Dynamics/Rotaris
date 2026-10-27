# Architecture proposals — UI slice — 5. Open questions

Part 9 of 10 of [the ui proposal](../ui.md), which indexes every part.

## 5. Open questions

These are places where the specification is silent, or where two requirements pull in different
directions, and where I have declined to invent an answer.

1. **Design reference (blocking several decisions).** The approved visual design reference is not
   available in this session. It is needed for: the theme palettes and the token values behind
   REQ-SHELL-129; the information architecture inside each of the seven views; the Markdown dialect
   and its treatments (see ADR-UI-14); and the visual form of the benchmark and diagnostics cards. No
   mechanism above depends on it, but no screen can be built without it.

2. **Process topology and the prompt queue.** REQ-CHAT-041 scopes queue visibility and consumption to
   windows and runs "sharing the same process", and REQ-CHAT-038 requires an atomic `QUEUED →
   TRIGGERED` transition that exactly one caller wins. If run execution moves to a separate runtime
   process, that becomes a cross-process exactly-once problem. Owned by the orchestration slice;
   binds ADR-UI-01 and ADR-UI-02.

3. **Native surfaces under a dark theme.** REQ-SHELL-160(b) requires that no native surface present a
   light background while a dark theme is active, on each supported platform; REQ-SHELL-164 says the
   product is answerable only for what it hands a native dialog, and the OS folder chooser on Windows
   and most Linux desktops follows the system setting rather than the application's. My reading is in
   ADR-UI-05; it needs confirming rather than assuming.

4. **Demo mode and process-wide network silence.** REQ-SHELL-005 says that in demo mode "the process
   opens no outbound network connection for its whole lifetime", while REQ-SHELL-162 lets a demo
   window be opened from a non-demo window and REQ-STARTUP-057 says "a non-demo window of the same
   process is unaffected and checks exactly as REQ-STARTUP-114 requires". Those cannot both hold once
   a mixed process exists. Either REQ-SHELL-005's claim is per-window rather than per-process, or a
   demo window must be its own process. The second reading has architectural consequences and the
   first is probably what was meant; it should be stated.

5. **`XDG_CONFIG_HOME` on non-Linux hosts.** REQ-UIBENCH-039 names it contractually. See the open
   question in ADR-UI-07: is it named because it is the one standard variable available (so the
   private variable carries the job elsewhere), or must the preference store honour it on all three
   platforms?

6. **What `widgets` and `ui_objects` mean for a DOM interface.** REQ-UIBENCH-050 defines them against
   "the interface framework the product is built on" and leaves the mapping to the implementation.
   ADR-UI-03 proposes a specific, honest mapping. Because it decides whether REQ-UIBENCH-054 is
   satisfiable at all, it should be reviewed explicitly rather than absorbed as an implementation
   detail.

7. **Application-modality across windows.** REQ-SHELL-051 calls the command palette
   "application-modal". Electron has no application-modal primitive, so ADR-UI-05 proposes enforcing
   it in the window registry. Confirmation that the intended behaviour really is "a click on the
   persona window while the palette is open does nothing" would be useful, since the alternative
   reading — window-modal, with the word used loosely — is much cheaper.

8. **The benchmark's per-process figures.** REQ-UIBENCH-050 reports `rss_bytes`, `threads` and
   `handles` "for the process that produced the record". In a multi-process browser engine there are
   several. ADR-UI-07 proposes the renderer process of the measured window; the alternative — the sum
   over the iteration's process tree — is also defensible and gives different numbers. Since
   REQ-UIBENCH-050 only claims comparability between runs of one revision, either is conformant, but
   the choice must be recorded.

9. **`REQ-EVENTS-005` and where a run executes.** "Every run executes inside the desktop application"
   reads naturally as "there is no headless entry point", not as "in the same OS process". If it is
   meant more strictly than that, it constrains the orchestration slice's topology and, through T3,
   mine.

---
