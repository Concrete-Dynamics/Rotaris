# Published-asset update verification — T3

Run from the repository root:

```
node tools/release-pipeline/update-path-proof.mjs
pnpm evidence write .proof/update-path --kind=update-path
pnpm evidence verify .proof/update-path
```

This is a standalone verifier proof, rather than an Electron launch proof. Node 24+ and network access to
GitHub's public release downloads are its prerequisites in the default mode. It uses the actual `verifyDetachedSignature`
from `apps/desktop/src/main/updater/keys.ts` with its default compiled-in public keys: no injected key,
fixture signature, signing operation, credentials or private-key access. The fixed source is the published
[v0.1.0rc1 release](https://github.com/Concrete-Dynamics/Rotaris/releases/tag/v0.1.0rc1).
It does not create or modify a release or execute downloaded installers.

For an offline replay, put the four original published files (both executables, manifest and signature) in
one directory, then run:

```
node tools/release-pipeline/update-path-proof.mjs --release-dir=/path/to/release
```

This mode streams those same files through the same checks and compiled-in keys. It does not generate
replacement signatures or trust a local key. Missing or altered files fail. The report records the local
source directory and the public release URL; correspondence to the release is established by its original
signature and the matching asset digests.

The negative case changes exactly the first hexadecimal digest character of `SHA256SUMS.txt`, preserving
its format, and retains the release's original signature. The verifier must return
`{ verified: false, reason: 'not-verified' }`. It then checks the unmodified manifest and signature:
verification must succeed with the build's own keys. Only after that verdict may it parse the manifest or
download an executable asset. This is the verify-before-parse ordering of REQ-STARTUP-122/167.
Finally it streams both actual published Windows assets into SHA-256 and requires exact agreement with the
signed manifest and the Windows-only asset set (REQ-STARTUP-123; PD-STARTUP-001).

Evidence is written under `.proof/update-path/`: `report.json` includes time, runtime, platform, source URL,
public-key fingerprints and every check's verdict, asset byte count and expected/actual digest. The original
manifest, original 64-byte detached signature and mutated manifest are retained. A negative-case acceptance,
a positive-case refusal, missing asset, incorrect digest, HTTP error, local read error or five-minute request timeout exits 1;
the report is written on failure too. No large binary is kept in memory or written into the checkout by the proof.

First execution, Linux, 2026-10-24, Node 26.8.1: the tampered manifest was refused (`not-verified`), the
original verified with key index 0, and the manifest named exactly the two expected Windows assets.
All five checks passed, including both full asset streams. The complete local replay later that day also
passed all five checks over the original files downloaded with curl (HTTP 200, 256913226 and 182561441 bytes).
The [captured report](update-path-2026-10-24.json) records that replay's actual verdicts; the table below records the matching asset digests.

| Asset | Bytes | SHA-256 in the signed manifest |
|---|---:|---|
| `Rotaris-0.1.0rc1-windows-x64-portable.exe` | 256913226 | `0bfd6ae0f3167bce424205035b4915126e74fb1e09df77bc41119b0cf82f0c59` |
| `Rotaris-0.1.0rc1-windows-x64-setup.exe` | 182561441 | `e824e1fc4ee7f824fe876742664cad19a55c0a4521c68611b3700399cdbb30c6` |

A repeat of the default network mode on 2026-10-24 passed all three manifest/signature checks, then hit
the five-minute asset-download deadline and exited 1. That run is incomplete, not a digest mismatch; its
report is retained as `.proof/update-path/remote-timeout.json`. The local mode allows a separate download
client to acquire the original files without changing any verification check.

This proves the published signature and artifact-digest verification path. It does not establish an
installed Windows application's feed selection, installer hand-off, rollback or restart. Those still need
the packaged Windows run described by [updater-proof](../proofs/updater-proof.md). The existing pipeline ↔
`runInstall` agreement tests remain the regression coverage for refusal before artifact requests.
