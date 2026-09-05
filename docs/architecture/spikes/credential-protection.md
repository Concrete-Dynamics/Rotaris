# Spike — the credential file's protection on Windows: apply, read back, and what survives

- **Date:** 2026-09-05
- **Taken as:** the first act of building the credential store (ADR-0029), with the vertical slice (Part K).
- **Question** (ADR-0029, "must be chosen by spike before the gate closes"; the gate ruled every unstarted
  spike bound to the work it prices): which mechanism applies `REQ-PROVIDER-016`'s explicit Windows
  access-control list — full control to the owning user and the local system account, nobody else,
  inheritance from the parent disabled — **and reads it back exactly**, so that a protection that was not
  applied refuses the write rather than warning. ADR-0029's preference order: (1) a maintained native
  binding, (2) the platform's command-line tool with security-identifier literals.
- **Status: taken; mechanism chosen; two findings recorded.**

## Method

No native binding is pinned: ADR-0054's updater and the packaged load proof (IC-6) both argue against a
new native module for one directory. Alternative (2) was measured: `icacls.exe` invoked with SID literals
(`*S-1-5-18` for the system account; the owner's SID read once from `whoami /user /fo csv /nh`, which is
locale-independent), and the read-back through `icacls <path> /save <file>`, which writes the DACL as an
**SDDL string** — SIDs, not localised account names — that a parser checks for exactly `D:P…` (protected,
inheritance disabled) and two allow ACEs with rights `FA` for exactly the two trustees.

Harness: a node script over a temp `tokens/` directory on this machine's NTFS system drive, unelevated.

## Measurements

| Case | Result |
|---|---|
| directory: `/inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *<owner>:(OI)(CI)F` | 37.5 ms; read-back `D:PAI(A;OICI;FA;;;<owner>)(A;OICI;FA;;;SY)` — **exact** |
| a file written into the protected directory, before its own protection | `D:AI(A;ID;FA;;;<owner>)(A;ID;FA;;;SY)` — the right trustees but **inherited**, so the requirement's "never left to inheritance" is not met by the directory alone |
| file: `/inheritance:r /grant:r *S-1-5-18:F *<owner>:F` | 36.8 ms apply, 39.0 ms read-back; `D:PAI(A;;FA;;;<owner>)(A;;FA;;;SY)` — **exact** |
| a file carrying a foreign **explicit** ACE (`BUILTIN\Users:R`), then `/inheritance:r /grant:r` | `D:PAI(A;;FA;;;<owner>)(A;;FA;;;SY)(A;;FR;;;BU)` — **three ACEs; the foreign grant survives** |
| the same, `/reset` first (one call) then `/inheritance:r /grant:r` (a second call) | **exact** |
| the same, `/remove *S-1-5-32-545` | exact — but only for a trustee the caller already knows about |
| `/reset /inheritance:r /grant:r …` in **one** call | refused, status 87: `Invalid parameter "/inheritance:r"` — `/reset` takes no companion |
| `/restore` with an exact SDDL (`D:PAI(A;;FA;;;SY)(A;;FA;;;<owner>)`) | refused, status 1300: *Not all privileges or groups referenced are assigned to the caller* — needs the restore privilege, which an unelevated process lacks |
| a temp file protected **then renamed** onto the target (ADR-0029's write order) | the DACL travels with the rename — **exact** |
| 20 × (apply + read-back) | 78–87 ms per file |
| a file copied in from outside with `copyFile` | arrives with the destination's inherited ACEs only; the copy does not carry the source's DACL |

## What it settled

1. **The mechanism is `icacls` with SID literals, in this order per path: `/reset`; then `/inheritance:r
   /grant:r` for the two trustees; then `/save` and parse the SDDL.** Three process spawns, about 120 ms per
   credential file, spent only on a save (rare) and never on a read. The read-back is the part that
   satisfies `REQ-PROVIDER-016`, and the spike shows why: without it the third row above would have been
   written as protected.
2. **`/reset` is not optional.** `/grant:r` replaces the *named* trustee's grant and leaves every other
   explicit ACE alone; only `/reset` (back to inherited defaults) followed by `/inheritance:r` yields a DACL
   that holds nothing but what the product then grants.
3. **`/restore` is unavailable** to the unelevated product, so the SDDL cannot be *set* directly; it can
   only be read back. The apply path stays imperative, the check declarative.
4. The staged-then-renamed write order ADR-0029 fixes keeps the temp file's protection on the target.

## What it found

The first candidate — `/inheritance:r /grant:r` alone — **passes every case in which the file starts
clean and fails the one in which it does not**, and only the read-back distinguishes them. Recorded in the
pattern ADR-0058 consequence 17 tracks: a mechanism that looks right until the instrument that checks it
is built. It is a finding on the mechanism, not a defect in shipped code; the store is built on the
corrected sequence and its test plants a foreign ACE before every save.

## Not measured

A non-NTFS volume (FAT/exFAT has no DACL: `icacls` fails, and the requirement's "if the protection cannot
be applied the credential is NOT written" then applies as specified); a directory whose owner is not the
current user (an elevated or service context); macOS and Linux (`chmod` + `stat`, with IC-3).
