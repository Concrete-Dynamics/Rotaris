# Seams — what to touch, in what order, to add one of the things this product adds most often

The other three views answer *what exists*. This one answers *where an addition lands*. Each seam below is
a vertical cut through the packages: the files in the order they must be edited, the invariant that holds at
each stop, and the evidence that re-verifies it.

What is deliberately **not** here: anything the code graph already answers. A symbol's location, a caller list
and a type's shape are one query away. What a query cannot give is the order, the stop that is easy to miss,
and the rule that makes the stop mandatory — and those are what cost an agent a morning.

Every seam ends the same way: **update the view that covers it in the same commit** (`views/README.md`).

| Seam | Add this when | Section |
|---|---|---|
| A renderer command | a surface must ask the application for something | [§1](04-seams/01-1-a-renderer-command.md#1-a-renderer-command) |
| A main → renderer channel | the application must tell a surface something unasked | [§2](04-seams/02-2-a-main-renderer-channel.md#2-a-main--renderer-channel) |
| A store table or column | a fact must survive the process that wrote it | [§3](04-seams/03-3-a-store-table-or-column.md#3-a-store-table-or-column) |
| A tool | an agent must be able to do something new | [§4](04-seams/04-4-a-tool.md#4-a-tool) |
| A configuration key | the owner must be able to set something | [§5](04-seams/05-5-a-configuration-key.md#5-a-configuration-key) |
| A notice or acknowledgement | the person must be told something | [§6](04-seams/06-6-a-notice-or-an-acknowledgement.md#6-a-notice-or-an-acknowledgement) |
| A preference key | a window must remember something | [§7](04-seams/07-7-a-preference-key.md#7-a-preference-key) |
| A drawn surface | anything is drawn, redrawn or restyled | [§8](04-seams/08-8-a-drawn-surface.md#8-a-drawn-surface) |

---

## Parts

Since 2026-10-26 the rest of this document is in [`04-seams/`](04-seams/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](04-seams/01-1-a-renderer-command.md) | 1. A renderer command |
| [02](04-seams/02-2-a-main-renderer-channel.md) | 2. A main → renderer channel |
| [03](04-seams/03-3-a-store-table-or-column.md) | 3. A store table or column |
| [04](04-seams/04-4-a-tool.md) | 4. A tool |
| [05](04-seams/05-5-a-configuration-key.md) | 5. A configuration key |
| [06](04-seams/06-6-a-notice-or-an-acknowledgement.md) | 6. A notice or an acknowledgement |
| [07](04-seams/07-7-a-preference-key.md) | 7. A preference key |
| [08](04-seams/08-8-a-drawn-surface.md) | 8. A drawn surface |
