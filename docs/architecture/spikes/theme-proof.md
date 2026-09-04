# Theme proof — three palettes from rendered pixels

- **Date:** 2026-09-04
- **Host:** Windows 11 Pro 10.0.26200, x64; one active 1920 × 1080 display
- **Command:** `pnpm theme-proof`
- **Requirements:** REQ-SHELL-030, REQ-SHELL-128–135, REQ-SHELL-145, REQ-SHELL-148–149,
  REQ-SHELL-160
- **Decision records:** ADR-0042, ADR-0048, ADR-0050

## What ran

The built Electron application ran once for each built-in theme at device scale factors 1, 1.25, 1.5,
1.75 and 2. Each run opened all seven primary views, every one of the thirteen Settings categories and a
keyboard-driven focus pass. `webContents.capturePage()` supplied PNGs; the proof decoded those PNGs and
sampled painted text, surrounding surfaces and the focus-ring band. It also checked the navigation labels,
the 17 px vector icon layout, renderer errors and a live theme switch that preserved the composer value and
active view.

The preference root, application-data directories and startup theme were isolated inside the proof's scratch
directory. The startup override wrote the same preference the product uses, before the first window, so each
capture exercised the ordinary startup read, native theme source, window ground and renderer projection.

## Result

All fifteen runs passed. The minima below are the lowest painted-pixel ratios observed across every page and
focus position for that theme. Each scale-factor column passed contrast, native-surface mapping, focus,
vector-icon scale, the 9 px “Requirements” label fit and theme completeness.

| Theme | Scale factors | Minimum text/boundary ratio | Minimum focus ratio | Six acceptance items |
|---|---|---:|---:|---|
| Rotaris Dim | 1, 1.25, 1.5, 1.75, 2 | 3.234:1 | 3.202:1 | PASS × 5 |
| Nocturne | 1, 1.25, 1.5, 1.75, 2 | 4.704:1 | 3.346:1 | PASS × 5 |
| High Contrast | 1, 1.25, 1.5, 1.75, 2 | 5.699:1 | 4.236:1 | PASS × 5 |

The application-owned native mapping passed on this host: Electron's theme source followed the theme's dark
flag; the document advertised the matching colour scheme; window grounds, carets, form controls and disabled
text followed the active palette. The operating-system folder chooser remains host-owned under ADR-0048's
reading and follows the system theme. Its appearance is an inspection observation rather than a product-colour
assertion under REQ-SHELL-164.

Only one active display was attached. REQ-SHELL-160(d)'s drag between displays of different scale therefore
remains an owner hardware measurement. The five forced scale-factor runs exercise every required factor on the
attached display.

## Counterfactuals

Both counterfactuals exited non-zero at their named item:

- lowering a Nocturne text token one stop produced `FAIL contrast`;
- replacing the focus token with a sub-3:1 colour produced `FAIL focus`.

## First-execution findings

The static pass rejected three values from the adopted one-palette source when they were used directly in the
specified semantic roles: `--rt-border-strong` reached 1.53–1.92:1 on its boundary surfaces, the literal primary
hover pairing reached 3.98:1, and disabled text on the surface reached 2.90:1. The adopted values remain
transcribed and covered by an equality test. The painted roles now use the semantic `--rt-boundary-strong` and
`--rt-primary-hover` tokens, while disabled primary controls use a neutral themed ground. Nocturne and High
Contrast carry raised disabled-text stops. These replacements preserve the rejected reasons beside the
correction and apply ADR-0050's lightness-only rule.

The first pixel run also exposed three harness faults. Off-viewport Settings elements entered the sample,
direct assignment to the composer bypassed React's controlled value, and programmatic focus did not establish
`:focus-visible`. The proof now requires `elementFromPoint` visibility, uses the native textarea value setter
with an input event, and drives focus with real Tab input events. The corrected run is the table above.

## Coverage boundary

The proof covers every surface currently reachable in the built application. Components still absent from any
screen acquire pixel coverage when their specified screen is drawn. macOS and Linux native surfaces and
artifacts remain IC-3. The different-scale multi-monitor drag remains the owner measurement described above.

## Disposition

IC-2 is **DISCHARGED**. The two palettes and complete metadata exist as runtime token data, and the six adopted
acceptance items pass from captured pixels across all fifteen runs on this display. OQ-30 closes against these
authored values and this measurement.
