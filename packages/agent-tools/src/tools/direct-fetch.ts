import { Agent } from 'undici';

// OQ-37: each request explicitly selects the direct dispatcher. Process-global
// proxy configuration and environment-derived dispatchers remain outside this path.
const directDispatcher = new Agent();

export const directFetch: typeof fetch = (input, init) => fetch(input, {
  ...init, dispatcher: directDispatcher,
} as RequestInit & { dispatcher: Agent });
