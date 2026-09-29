import { describe, expect, it } from 'vitest';
import { runtimeArguments } from './sentinel.js';

describe('REQ-MCP-033 / ADR-0035: the arguments the sentinel hands the bundled runtime', () => {
  it('drops the separator the launch puts after the token', () => {
    expect(runtimeArguments(['--', 'start-mcp-server', '--project', '/w'])).toEqual(['start-mcp-server', '--project', '/w']);
  });
  it("R-066: drops the launcher's own switches before the separator, which are Chromium's", () => {
    expect(runtimeArguments(['--no-sandbox', '--', 'project', 'create', '/w'])).toEqual(['project', 'create', '/w']);
  });
  it("keeps a runtime's own `--` after the separator, and passes arguments with no separator as they are", () => {
    expect(runtimeArguments(['--', 'a', '--', 'b'])).toEqual(['a', '--', 'b']);
    expect(runtimeArguments(['start-mcp-server'])).toEqual(['start-mcp-server']);
    expect(runtimeArguments(['--no-sandbox', 'start-mcp-server'])).toEqual(['--no-sandbox', 'start-mcp-server']);
  });
});
