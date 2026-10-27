# First executions

**What this register is for.** `CLAUDE.md` carries a standing policy: *a mechanism's first execution reports
back into the record that decided it, in place, including when it found nothing.* The policy is justified by a
ratio — how many mechanisms have been executed for the first time, and how many of those held a defect no reading
had caught. This file is where that ratio is **read**, not where it is asserted.

**The invariant: one row per first execution, appended, never rewritten.** The count is the number of rows. It is
written nowhere, so it cannot go stale. A correction is a **new row citing the old one**, the same shape
`docs/spec/README.md` already fixes for requirements — "a changed requirement gets a new revision, not a new
number". A row here never restates what the deciding record says; it points at it.

**What a row is.** A *mechanism* is something the architecture record decided on paper: an ADR's flow, a store,
a protocol, a harness. Its *first execution* is the first time it ran against something real. A mechanism that
ran and found nothing still gets a row — a denominator with no numerator is the whole point of keeping a ratio.

---

## Parts

Since 2026-10-26 the rest of this document is in [`first-executions/`](first-executions/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part. **A new row is appended to the last part**; when that would take it past the budget, a new part starts with the table's two header rows, and its row is added below.

| Part | What it holds |
|---|---|
| [01](first-executions/01-why-this-file-exists-three-counters-three.md) | Why this file exists: three counters, three numbers, no owner |
| [02](first-executions/02-the-register.md) | The register |
| [03](first-executions/03-the-register-2.md) | The register *(continued, from "2026-09-15")* |
| [04](first-executions/04-the-register-3.md) | The register *(continued, from "2026-09-16")* |
| [05](first-executions/05-the-register-4.md) | The register *(continued, from "2026-09-23")* |
| [06](first-executions/06-the-register-5.md) | The register *(continued, from "2026-09-27")* |
| [07](first-executions/07-the-register-6.md) | The register *(continued, from "2026-09-28")* |
| [08](first-executions/08-the-register-7.md) | The register *(continued, from "2026-09-28")* |
| [09](first-executions/09-the-register-8.md) | The register *(continued, from "2026-09-28")* |
| [10](first-executions/10-the-register-9.md) | The register *(continued, from "2026-09-29")* |
| [11](first-executions/11-the-register-10.md) | The register *(continued, from "2026-09-29")* |
| [12](first-executions/12-the-register-11.md) | The register *(continued, from "2026-09-29")* |
| [13](first-executions/13-the-register-12.md) | The register *(continued, from "2026-09-29")* |
| [14](first-executions/14-the-register-13.md) | The register *(continued, from "2026-09-30")* |
| [15](first-executions/15-the-register-14.md) | The register *(continued, from "2026-09-30")* |
| [16](first-executions/16-the-register-15.md) | The register *(continued, from "2026-10-01")* |
| [17](first-executions/17-the-register-16.md) | The register *(continued, from "2026-10-01")* |
| [18](first-executions/18-the-register-17.md) | The register *(continued, from "2026-10-01")* |
| [19](first-executions/19-the-register-18.md) | The register *(continued, from "2026-10-02")* |
| [20](first-executions/20-the-register-19.md) | The register *(continued, from "2026-10-02")* |
| [21](first-executions/21-the-register-20.md) | The register *(continued, from "2026-10-02")* |
| [22](first-executions/22-the-register-21.md) | The register *(continued, from "2026-10-04")* |
| [23](first-executions/23-the-register-22.md) | The register *(continued, from "2026-10-06")* |
| [24](first-executions/24-the-register-23.md) | The register *(continued, from "2026-10-07")* |
| [25](first-executions/25-the-register-24.md) | The register *(continued, from "2026-10-07")* |
| [26](first-executions/26-the-register-25.md) | The register *(continued, from "2026-10-13")* |
| [27](first-executions/27-the-register-26.md) | The register *(continued, from "2026-10-13")* |
| [28](first-executions/28-the-register-27.md) | The register *(continued, from "2026-10-13")* |
| [29](first-executions/29-the-register-28.md) | The register *(continued, from "2026-10-14")* |
| [30](first-executions/30-the-register-29.md) | The register *(continued, from "2026-10-14")* |
| [31](first-executions/31-the-register-30.md) | The register *(continued, from "2026-10-15")* |
| [32](first-executions/32-the-register-31.md) | The register *(continued, from "2026-10-18")* |
| [33](first-executions/33-the-register-32.md) | The register *(continued, from "2026-10-20")* |
| [34](first-executions/34-the-register-33.md) | The register *(continued, from "2026-10-23")* |
