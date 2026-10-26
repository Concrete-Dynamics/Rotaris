[Product directives](../directives.md) › PD-WORKSPACE-003

<a id="pd-workspace-003"></a>

### PD-WORKSPACE-003 — "Load skill file…" opens a file chooser

The "Load skill file…" action of REQ-WORKSPACE-151 SHALL open the platform's own **file** chooser, filtered to Markdown
files (`.md`), on Windows and Linux, whose host dialog cannot offer a file and a directory at once; on macOS, whose dialog can,
it SHALL offer both, with the same filter on files. A host dialog filters by extension, not by file name, so the restriction
to `SKILL.md` is the loader's: a chosen file not named `SKILL.md` SHALL be refused with REQ-WORKSPACE-057's
"manual skill path must be a SKILL.md file or directory: {raw}", and a chosen directory holding none with its
"SKILL.md not found: {raw}", each leaving the catalog unchanged. A directory holding a `SKILL.md` is reached by selecting
that file. REQ-WORKSPACE-057's directory form stays reachable through the typed `/skill <path>` command (REQ-CHAT-162), with
REQ-WORKSPACE-057's own directory-path error. No second header action is added. Everything else REQ-WORKSPACE-151 states
still governs.

**As built.** The chooser ADR-0063 planned: `openFile` on win32 and linux, `openFile` and `openDirectory` on darwin, with
the filter `{ name: 'Skill document', extensions: ['md'] }` (`apps/desktop/src/main/index.ts`, `chooseSkillFile`); the
dialog therefore offers every Markdown file, `README.md` included. The name check is `loadManualSkill`'s
(`packages/config/src/skills/manual.ts`), pinned by `packages/config/src/skills/skills.test.ts` (`/ws/notes.md` refused
with `skillPathNotAcceptable`). OQ-59's own entry described the filter as "filtered to `SKILL.md`"; the build never had
that, and this text states what it has. *On Windows (2026-10-21, the Windows ARM64 session's D2) the real dialog showed exactly that: "Load a skill file", opening on the workspace, one entry "Skill document", `README` listed and `notes.txt` not; `README.md` was then refused by the name check, and a lower-case `skill.md` was refused too ([the note](../../defects/a-hand-loaded-skill-md-in-lower-case-is-refused-on-a-case-insensitive-file-system.md)).*

**Why, and what it costs.** OQ-59: REQ-WORKSPACE-151 asks for a chooser "restricted to selecting a `SKILL.md` file or a
directory containing one", which no platform dialog but macOS's offers, and REQ-SHELL-164 holds the product answerable only
for what it supplies to the host. The owner amended the requirement to the file chooser as built. What it costs: on two of
three platforms the dialog cannot pick a folder; the command can.

> **Narrows:** REQ-WORKSPACE-151

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-59.*
