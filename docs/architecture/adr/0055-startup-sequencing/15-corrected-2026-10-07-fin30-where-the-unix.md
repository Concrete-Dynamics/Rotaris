# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget — Corrected 2026-10-07 (fin30): where the unix socket lives, and a claim that cannot listen

Part 15 of 17 of [ADR-0055](../0055-startup-sequencing.md), which indexes every part.

## Corrected 2026-10-07 (fin30): where the unix socket lives, and a claim that cannot listen

"A named pipe on Windows, a unix-domain socket on macOS and Linux" said nothing about where the socket is, and the code
answered with the data directory, or `XDG_RUNTIME_DIR` when one was set (2026-09-19, for the proofs). Two things this record
never priced followed from that. A unix socket's address holds 108 bytes on Linux and 104 on macOS, so a data directory below a
home of about sixty characters could not hold one: the listen failed with `EINVAL`, nothing awaited the rejection, and the launch
ended with no window and nothing said
(`docs/defects/fixed/a-deep-data-directory-leaves-the-launch-windowless.md`). And a set-but-empty `XDG_RUNTIME_DIR` addressed the
socket relative to the working directory, so the record named an endpoint only a launch from that same directory could reach
(`docs/defects/fixed/an-empty-xdg-runtime-dir-puts-the-instance-socket-in-the-working-directory.md`).

Since fin30 the socket goes in the first of `socketDirectoryCandidates` (`packages/platform/src/instance.ts`) that is absolute,
leaves the whole path inside the platform's limit, and can hold a file: `XDG_RUNTIME_DIR`, the data directory beside the record,
then a private `rotaris-<uid>` directory (`0700`, owned by this user, refused otherwise) below the temporary directory and below
`/tmp` — the replacement directory the XDG Base Directory Specification tells an application without a runtime directory to fall
back to. *Since fin36 (2026-10-13, [OQ-248](../../open-questions/53-spikes-and-later-questions-20.md#oq-248)) that private directory is made per claim attempt
(`mkdtemp`, `rotaris-XXXXXX`, `0700`) and removed with the socket; the shared `rotaris-<uid>` above, which another local user
could take first and which nothing removed, no longer governs.* The record still lives in the data directory, as `REQ-STARTUP-161` requires; only the address it names moves, and the
record's `endpoint` field is what every later launch reads, so nothing has to guess it. A claim whose listen still fails gives its
record back and is refused with the reason, which main logs at `error` before it exits 2 — `REQ-STARTUP-164`'s bounded end
rather than a launch left running with no window. No platform dialog is raised for it: ADR-0019's prohibition on a synchronous
native box in main stands.

~~**The order this record fixes is not yet what the code does.** "The endpoint is listening before the record is written" is the
rule above; `claimInstance` takes the record first and opens the endpoint after it, and fin30 kept that order, giving the record
back when the listen fails rather than reordering the claim. Recorded, not repaired:~~
~~`docs/defects/the-instance-record-is-written-before-its-endpoint-listens.md`.~~ <!-- historical-path: docs/defects/the-instance-record-is-written-before-its-endpoint-listens.md -->

**Since fin34 (2026-10-13) the code keeps the order this record fixes.** Each claim attempt opens its endpoint first
(`openEndpoint`) and only then takes the record by exclusive create naming it; an attempt that loses the record closes the
endpoint it opened (`closeEndpoint`), and a listen that fails writes no record at all, so there is nothing to give back. The
property is pinned where a second launch stands: `packages/platform/src/instance-order.test.ts` connects to the endpoint the
record names at the instant the record is written, and fails on the old order
(`docs/defects/fixed/the-instance-record-is-written-before-its-endpoint-listens.md`). The interval in which two launches could
both become the instance needed launches started within one `listen` of each other; it was read from the code, never
measured, and is closed by construction rather than by a measured bound. The order has a cost this record did not price: a launch that loses
the claim has opened, and then removes, an endpoint of its own, which on a platform whose endpoint is a file contradicts "a
launch that is handed over writes nothing" above (corrected there; [OQ-248](../../open-questions/53-spikes-and-later-questions-20.md#oq-248), ruled 2026-10-13:
the endpoint is part of the record, and a handed-over launch leaves nothing behind).

**Since fin36 (2026-10-13), OQ-248's ruling as built.** `placeSocket` (`packages/platform/src/instance.ts`) makes each
attempt's private directory below a temporary-directory candidate with `mkdtempSync`, `socketDirectoryCandidates` sizes such a
candidate with the `rotaris-XXXXXX/` component, and `closeEndpoint` — which the instance's closer and the successor's now share
— removes the socket and that directory (`rmdirSync`, never recursive); `removeDeadEndpoint` unlinks, at a reclaim of a record
whose process is dead on this host, the socket that record names when it is a socket of this user's named
`instance-<pid>-<8 hex>.sock`, and its per-attempt directory once empty. Pinned by `instance.test.ts` (a name already taken
below the temporary directory no longer denies the fallback; the candidates' sizing; the reclaim's three cases) and
`instance-order.test.ts` (on the fallback, the handed-over launch leaves nothing and the closed instance takes its directory),
each red on the code before, and by `pnpm workspace-proof`'s scenario 13b.
