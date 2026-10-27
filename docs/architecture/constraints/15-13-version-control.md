# Architectural constraints extracted from the specification — 13. Version control

Part 15 of 22 of [the constraints](../constraints.md), which indexes every part.

## 13. Version control

| # | Constraint | Label | Requirements |
|---|---|---|---|
| V-01 | Every operation is a **bounded external invocation** and the bounds differ by layer; a limit is the whole budget and a timeout is a correct result, not a defect. **No operation may block indefinitely on a child process.** | HARD | REQ-GIT-013, REQ-GIT-033, REQ-GIT-102, REQ-GIT-103, REQ-GIT-141, REQ-GIT-146, REQ-TRACE-170 |
| V-02 | **The tool's own error output is the error text, verbatim**, with exactly one case where wording is replaced and three phrase matches deciding a branch collision; the rendered command has **no quoting, eliding or truncation of any argument**. | HARD | REQ-GIT-010, REQ-GIT-012, REQ-GIT-013, REQ-GIT-033, REQ-GIT-110, REQ-GIT-111, REQ-GIT-116 |
| V-03 | Output is decoded as UTF-8 **with replacement, never strictly**. | HARD | REQ-GIT-013, REQ-TRACE-006, REQ-TRACE-081 |
| V-04 | **Fourteen named environment variables must be neutralised per invocation** and the repository and working tree named explicitly on every invocation; **every other variable is passed through unchanged**. | HARD | REQ-GIT-031 |
| V-05 | A checkpoint must leave the user's entire version-control state **byte-identical**, including the on-disk index file, the reference logs, the stash and the branch set; no reference-log entry is written, no repack or collection is started, and **the index is never refreshed, rewritten or locked**. | HARD | REQ-GIT-004, REQ-GIT-030 |
| V-06 | Checkpoints are **ordinary commit objects reachable only from a fixed reference namespace**, disjoint from the improvement namespace so neither feature's pruning can delete the other's. | HARD | REQ-GIT-029, REQ-LIBRARY-067 |
| V-07 | Sequence numbers come from **the maximum of two sources** plus one, so numbering climbs across a prune, a resume and an externally deleted reference. | HARD | REQ-GIT-046, REQ-GIT-059, REQ-LIBRARY-071 |
| V-08 | Reference deletions **verify the recorded commit id at deletion time** — the only compare-and-swap primitive named anywhere. | HARD | REQ-GIT-041 |
| V-09 | Capture content rules are exact, including tracked-but-ignored paths, the executable bit, symlinks recorded as symlinks, submodules recorded as a commit id only, and a nothing-to-record comparison against **a filtered HEAD tree**. | HARD | REQ-GIT-034, REQ-GIT-039 |
| V-10 | The product-directory exclusion is a **first-component, case-insensitive, name-based test that never follows links**, and is a **different rule** from the ignore rules. | HARD | REQ-GIT-003, REQ-GIT-034, REQ-GIT-035 |
| V-11 | **No network subcommand, ever**, and **no write to the user's version-control configuration** — including the long-path remedy, which tells the user the command rather than running it. | HARD | REQ-GIT-001, REQ-GIT-012, REQ-GIT-114 |
| V-12 | Repository detection and tool availability are decided **by asking the tool, not the filesystem**, and **no console window may appear** while a refresh runs. | HARD | REQ-GIT-042, REQ-GIT-102, REQ-GIT-103 |
| V-13 | Branch namespaces are fixed and mutually disjoint; a name the system derives is transformed into normal form, while a name a caller or user supplies is **never transformed** — it is accepted only if already normal. | HARD | REQ-GIT-007, REQ-GIT-009, REQ-GIT-010, REQ-GIT-116, REQ-GIT-130 |
| V-14 | Whether a checkpoint reference carries a reference log of its own. | FREE | REQ-GIT-004 |

---
