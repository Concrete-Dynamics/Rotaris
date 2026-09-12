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
