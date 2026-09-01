A Card with a flush table inside (no card padding around it) — the recurring delegation-tree and commit-list assembly. Cells accept any node, so mix mono text, `Tag`, `StatusDot`.

```jsx
<TableCard
  title="Recent commits"
  actions={<button className="btn btn-link">View all</button>}
  columns={['Commit', 'Message', 'Author', 'When']}
  rows={[
    [<span className="mono">a3f19c2</span>, 'refactor token refresh', 'you', '2h ago'],
    [<span className="mono">9e0b7f1</span>, 'add session redirect test', 'tester', '1d ago'],
  ]}
  footer="128 commits on main"
/>
```
