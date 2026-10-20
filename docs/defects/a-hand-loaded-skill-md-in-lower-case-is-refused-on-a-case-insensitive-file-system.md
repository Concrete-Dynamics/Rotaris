## A hand-loaded skill.md in lower case is refused on a case-insensitive file system

The Windows ARM64 session's D2 (Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree,
Git Bash, built at `dbf6a514`) loaded skills by hand from Settings › Skills. A file named `skill.md` holding a well-formed skill
(front matter with a name and a description) was refused:

```
manual skill path must be a SKILL.md file or directory: <workspace>\lower\skill.md
```

The same content at `hand\SKILL.md` loaded as `manual`. The refusal is `packages/config/src/skills/manual.ts`'s
`basename(absolute) !== SKILL_FILE`, a case-sensitive comparison. On Windows (and on a default macOS volume) the file system
does not distinguish the two spellings: `skill.md` and `SKILL.md` name the same file, a folder cannot hold both, and the
native chooser offered `skill.md` under its "Skill document" filter like any other `.md` file. A person who saved the file in
lower case is told the file is not a SKILL.md file. The choice reached the product through the chooser's verification seam
(`ROTARIS_CAPTURE_SKILL_FILE`); the real chooser on this host could be read but not driven to a choice.

Not checked: whether directory discovery (`.agents/skills/<name>/SKILL.md`) treats a lower-case `skill.md` the same way, and a
directory given by hand whose file is `skill.md` (REQ-WORKSPACE-057's other accepted form).

## Specs

REQ-WORKSPACE-057 accepts "a `SKILL.md` file" loaded by hand. Whether a case variant of that name on a file system that ignores
case is that file is not said; the product reads it as not. If the requirement means the file a person can name, this
contradicts it on Windows; if it means the exact spelling, the refusal's sentence still misleads, since the file is a
skill document by every other test. Not classified here.

## Relevant files

- `packages/config/src/skills/manual.ts` — `loadManualSkill`'s basename check against `SKILL_FILE`.
- `apps/desktop/src/main/index.ts` — `chooseSkillFile`, the chooser whose `*.md` filter offers the lower-case file.
