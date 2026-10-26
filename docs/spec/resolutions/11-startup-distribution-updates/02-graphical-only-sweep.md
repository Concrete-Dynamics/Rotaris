# Resolution Record — Domain 11, Application Startup, Distribution, and Updates — Graphical-only sweep

Part 2 of 5 of [domain 11's resolutions](../11-startup-distribution-updates.md), which indexes every part.

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
