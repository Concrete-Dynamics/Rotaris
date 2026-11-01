# ADR-0020 — history

The passages of [ADR-0020](../../../architecture/adr/0020-terminal-execution.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="struck-2026-09-30"></a>

**The struck text of 2026-09-30**, from [0020-terminal-execution/08-second-first-execution-2026-09-12-four-defects.md](../../../architecture/adr/0020-terminal-execution/08-second-first-execution-2026-09-12-four-defects.md), “Second first execution — 2026-09-12, four defects a real 22-minute run found”:

~~Now the paused call closes on its own frame with its own status, or else on the next call's frame with none, reported
as −1 with the reason, and what it collected ends at the next call's printed start marker; its listener goes with it.~~

<a id="struck-2026-09-30-2"></a>

**The struck text of 2026-09-30**, from [0020-terminal-execution/11-fourth-first-execution-2026-09-29-a-sigint-the.md](../../../architecture/adr/0020-terminal-execution/11-fourth-first-execution-2026-09-29-a-sigint-the.md), “Fourth first execution — 2026-09-29, a SIGINT the shell discarded, sent again (OQ-135, R-067)”:

~~At 250 ms and
1.5 s, while the session runs, the process table (`linuxProcessTable`, `@rotaris/platform`) is read for members that
never received the signal: alive at SIGINT's default, created within one second before it. Each is sent SIGINT once
more, alone (`missedSigint`), and the re-delivery is logged. After it, 0 of 200 ran on, with and without the burners.
A command that catches SIGINT is never sent a second.~~

<a id="struck-2026-09-30-3"></a>

**The struck text of 2026-09-30**, from [0020-terminal-execution/11-fourth-first-execution-2026-09-29-a-sigint-the.md](../../../architecture/adr/0020-terminal-execution/11-fourth-first-execution-2026-09-29-a-sigint-the.md), “Fourth first execution — 2026-09-29, a SIGINT the shell discarded, sent again (OQ-135, R-067)”:

~~A member is sent SIGINT once more, alone (`missedSigint`), only when
the first reading found it still the shell, holding SIGINT off (the aimed reading found `dash` and its `vfork`ed child
both `blocked`), and the later one finds it running another image at SIGINT's default. A process the first reading
found running the command is never sent a second. With that predicate 0 of 200 ran on under six burners (twice) and
without them; with re-delivery disabled, 8 of 200 still ran on under the burners.~~
