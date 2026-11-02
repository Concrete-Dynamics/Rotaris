## The MCP client reports a literal product version

`@rotaris/mcp` declared `export const CLIENT_INFO = { name: 'rotaris', version: '0.1.0' } as const` and passed it to
`new Client(CLIENT_INFO, …)`, so every `initialize` the running product sent — tool discovery, the settings probe and
each session's connection, all from the run host — told the server the product was version `0.1.0`, from a literal the
built bundle carried (`out/main/run-host.js`). Nothing tied it to the version the build declares
(`apps/desktop/package.json`) and the release guard did not know it existed. Declaring `0.2.0` and tagging `v0.2.0`
would have passed `pnpm release:guard`'s version half and published an artifact that still called itself `0.1.0` to
every tool server; at the planned `v0.1.0rc1` the About row would have read `v0.1.0rc1` and every handshake `0.1.0`.

## Specs

`REQ-STARTUP-158`: every artifact a release publishes "SHALL declare, and SHALL report at run time, that same version",
and the pre-build guard of `REQ-STARTUP-028` is where that is decided. `REQ-STARTUP-007`: the running desktop's version
is the one its installation metadata declares. The version half of the guard's first execution (ADR-0054, "One version
and the pre-build guard") recorded one declared place and claimed it was "the only version an artifact carries", which
this literal falsified.

## Relevant files

- `packages/mcp/src/client.ts` — `CLIENT_INFO`, the literal; now `CLIENT_NAME` and the required `OpenOptions.clientVersion`.
- `packages/mcp/src/{discovery,probe,sessions}.ts` — the three connection paths, each now handed `clientVersion`.
- `apps/desktop/src/run-host/{host,mcp}.ts` — the composition root that now reads the version and hands it to `McpHost`.
- `tools/release-guard/src/versions.ts` — `PRODUCT_VERSION_PLACES` and the claim that was false.

Found 2026-09-27 by the gate round that reviewed the version guard (first-release plan §4.1), three verifiers
independently.

## Repaired — 2026-09-27, same day

Made a reader rather than a second place for the guard to check. `@rotaris/platform`'s `installedProductVersion(bundleDir)`
reads the manifest two levels above a bundle, which is `apps/desktop/package.json` from `out/main/` and
`app.asar/package.json` packaged; main passes `__dirname` and the run host `import.meta.dirname`, the same directory.
The run host hands the result to `McpHost` (`productVersion`), which gives it to `ToolDiscovery`, `HealthProbe` and
`SessionConnections` as `clientVersion`, required with no default, and `openClient` sends
`{ name: 'rotaris', version: clientVersion }`.

`mcp.test.ts` asserts that all three paths tell the fixture server the version they were handed (the fixture gained
`--client-file`), and it fails with the literal put back. `mcp-proof`'s discovery launch now requires both of alpha's
handshakes to name the version `apps/desktop/package.json` declares. **Measured on the built app** with a scratch copy of
that proof pointed at the Linux configuration directory (see
`../proofs-write-the-global-configuration-where-only-windows-reads-it.md`): both handshakes named `rotaris 0.1.0`, and
with the manifest temporarily declaring `0.2.0rc1`, both named `rotaris 0.2.0rc1`.
