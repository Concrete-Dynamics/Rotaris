## driver-proof's persona-window shot can fail `UnknownVizError` and end the proof on Windows

Seen once in two runs on 2026-11-04, Windows 11 ARM64, Node 26.13.0, `C:/dev/Rotaris-wt-hrd2-thinpackages` (branch
`hrd2-thin-packages`, on `4930c49a`), CPU load about 34 % with six Electron processes of two other trees running. Record-only:
noticed by hardening bundle F3 while it added step 9e, which this is not part of.

In the second launch, step 13b opens the child's persona window, probes it through `useWindow('persona:coding-agent')` and
then shoots it (`r.screenshot(join(output, 'shots', 'run-3-persona.png'))`). In the first run the driver answered that shot
with the error `UnknownVizError` — the text `webContents.capturePage()` rejected with — and since the call is awaited
outside any `catch`, the proof ended at once (`Error: UnknownVizError` from `lib/driver.mjs:64`, exit 1) with step 13b's
check and everything after it (13c, 13d) never run. The window was listed `visible: false` when the step began. The second run
on the same build, a minute later, shot the same window and passed every later check.

Whether the product's capture (the driver's `screenshot` op, `driver.ts`) should answer a window that cannot be captured with
a reply that says so — as it already does for a window that presents no frame (`painted: false`) — or the proof should read
the refusal as a check rather than a crash, is not decided here. The cause on the host side (an occluded or not yet
composited window on a shared desktop) is not established.

## Specs

None: the driver is verification tooling no requirement names. REQ-SHELL-072's persona window is what the step reaches.

## Relevant files

- `apps/desktop/scripts/driver-proof.mjs` — step 13b, the persona window's `screenshot`, awaited with no `catch`.
- `apps/desktop/src/main/driver.ts` — the `screenshot` op: `capturePage()` after the paint wait; a rejection becomes the reply's error.
- `apps/desktop/scripts/lib/driver.mjs` — the client rejects the op's promise with the driver's error text.
