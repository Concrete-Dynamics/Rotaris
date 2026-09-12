# Geometry probes

Run probes through `pnpm app:drive eval`. Return `JSON.stringify(...)` so values cross the driver seam.

## Box and text fit

```js
JSON.stringify([...document.querySelectorAll('[data-ui]')].map((el) => {
  const r = el.getBoundingClientRect();
  return { id: el.dataset.ui, x: r.x, y: r.y, width: r.width, height: r.height,
    scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
    scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
}))
```

## Hit test

```js
JSON.stringify((() => {
  const el = document.querySelector('[data-ui="target"]');
  const r = el.getBoundingClientRect();
  const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
  const hit = document.elementFromPoint(x, y);
  return { x, y, topmost: hit === el || el.contains(hit), hit: hit?.className ?? hit?.tagName };
})())
```

## Guards

- Closed `details` content retains boxes while remaining unpainted.
- A scrolled child may have a box outside its clipping ancestor.
- Fixed descendants use the viewport until an ancestor establishes a containing block through transform, filter, perspective, will-change, or contain.
- A maximized window must leave maximized state before a requested content resize can take effect.
- A sweep with zero tested controls is a finding about evidence coverage.
- **A screenshot can be older than the state it is supposed to show.** `capturePage` answers with the last composited frame, and an occluded window composites nothing, so a capture can succeed and be a photograph of an earlier moment. When consecutive captures must differ, compare their bytes; one pixel of resize and back forces a frame. Found 2026-09-12, after thirty-two identical frames read as "no control paints a focus ring".
- **Settling is a loop, not a step.** A surface that mounts during the wait — the startup notice does — begins animating after `document.getAnimations()` has already been read. Re-read until nothing finite is running, and record per element whether it was still moving, so a string photographed mid-fade is reported as skipped rather than as a contrast failure.
- A control marked `aria-disabled` wears the disabled colour and answers to the disabled floor; a check that reads `:disabled` alone holds it to the enabled one.
