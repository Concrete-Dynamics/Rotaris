# State ownership — which process owns a fact, and where it lives

Six homes. A fact lives in exactly one of them, and the process that owns it is the only one that writes it.
This view exists because the facts were true but scattered — across the process view's ownership table, the
runtime view's store and configuration sections, and the preference rules stated inline in a command list —
and "who owns this?" is the question a change asks first.

The short rule, which the rest of this file only makes precise:

```
UI state        → the renderer that draws it
process state   → the process that holds the resource
business state  → the workspace store
source state    → the filesystem and Git
credentials     → main, and main alone
```

## Parts

Since 2026-11-20 the tables are in [`05-state-ownership/`](05-state-ownership/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)): the file had reached the budget
and the next row would have crossed it.

| Part | Holds |
|---|---|
| [1](05-state-ownership/01-volatile.md) | Volatile — lost when the process ends |
| [2](05-state-ownership/02-durable-and-the-rules.md) | Durable — survives the application; the rules that make the table hold |
