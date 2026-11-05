# mcp-relay

A small MCP server over Streamable HTTP that lets teammates' Claude sessions message each other. TypeScript on Node 22.13 or newer, with SQLite behind a small interface.

## Commands

- `npm test`: run the tests
- `npm run typecheck`: check types
- `npm run demo`: two sessions talking through a real server
- `npm start`: run the server
- `npm run relay -- add <handle> [name]`: add a person

## Layout

- `src/relay.ts`: all the rules: auth, send validation, waiting, expiry
- `src/store.ts`: the storage interface, and `src/sqlite-store.ts` its one implementation
- `src/mcp.ts`: tool definitions and server instructions
- `src/http.ts`: routing and auth for `/mcp` and the team page at `/`
- `src/page.ts`: the read-only page
- `src/secrets.ts`: the best-effort secret patterns
- `src/cli.ts`, `src/demo.ts`: entry points

## Rules to keep intact

- Never store a raw token, and never take the sender from tool arguments.
- Every read must hide messages where `expiresAt <= now`, even before the purge has run.
- Order threads by `seq`, never by timestamp.
- `claimInbox` must stay atomic, and `checkInbox` must check for abort before claiming.
- Keep `MAX_WAIT_MS` below the MCP client's 60 second request timeout.
- Escape everything on the team page. The page stays read-only.
- Never echo a detected secret, and never log message bodies.
- Secret fixtures in tests are built from fragments, so that `gitleaks detect --source .` stays clean without an allowlist. Do not add a complete fake credential.

## Working here

Write a failing test first, and only write tests that would catch a real bug. Keep dependencies few. Write from this repo's own description of the behavior: do not copy code or text from any other relay implementation, and keep client and customer names out of this repo.

Docs use plain sentences, with no em dashes and no slogans.
