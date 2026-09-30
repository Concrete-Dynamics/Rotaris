/**
 * REQ-SANDBOX-083 fixes `error_class` to this name. An implementation exception name MAY appear in
 * optional, redacted diagnostic detail; it MUST NOT change the class.
 *
 * In a module of its own so a renderer can refuse with it (REQ-SANDBOX-077's closing paragraph)
 * without importing the barrel that imports the renderer.
 */
export class SandboxUnavailableError extends Error {
  override readonly name = 'SandboxUnavailableError';
  constructor(message: string) { super(message); }
}
