# First executions — Why this file exists: three counters, three numbers, no owner

Part 1 of 34 of [the first-executions register](../first-executions.md), which indexes every part.

## Why this file exists: three counters, three numbers, no owner

Before this register there were three places counting, and on 2026-09-11 they read:

| Where | Number | What it actually counts |
| --- | --- | --- |
| `adr/0058-the-workspace-database.md` consequence 17 | **four** | the four this record itself measured — ADR-0054's two, this record's restore, and the harness built to measure it |
| `adr/0058-the-workspace-database.md`, the run-loop section (one appended sentence) | **fifty-three** | mechanisms whose first execution held a defect, project-wide, appended to since 2026-09-03 |
| `codebase.md` | **eighty** | defects found during the build, whatever found them |
| `CLAUDE.md` | fifty-three **+ four + one** | the middle one, plus the build toolchain's and the relay's |

None of them is wrong on its own terms and no two are comparable, because no two count the same thing and none
says which it counts. Two further facts make the drift concrete rather than theoretical:

- **The sequences overlap and contradict.** ADR-0058 numbers the composer and structured questions **48–53**
  (Parts AB/AC, 2026-09-07). `codebase.md` numbers Part AL's **50–52** and Part AM's **53–55** (2026-09-09) — a
  different sequence over the same integers. Wave 1's renumbering in merge order is where the collision becomes
  visible; it is not where it starts, which is Part Y on 2026-09-07. See the reconciliation at the end.
- **`CLAUDE.md` cites a number its source does not carry.** It attributes fifty-three to "ADR-0058 consequence
  17"; consequence 17 says four. The fifty-three is in a different section of that ADR, inside a single sentence
  several thousand words long that has been appended to for two months.

This register takes the **ratio** question and nothing else. `codebase.md` keeps its defect ledger; the two now
name each other and neither restates the other's number.

---
