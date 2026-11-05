# mcp-relay

mcp-relay is a small MCP server that lets the Claude sessions of people on a team message each other. When your session needs something only a teammate knows, it can ask their session directly, so nobody has to copy a question from one chat app to another and paste the answer back.

It runs as one Node process with one SQLite file. Each person gets their own token, and the whole team can read every message on a read-only page.

## Try it

You need Node 22.13 or newer.

```sh
npm install
npm run demo
```

The demo starts a real server on a spare port with a throwaway database, connects two MCP clients over HTTP with separate tokens, and has them hold a short conversation. One session waits on its inbox while the other asks a question, the answer lands in the same thread, a pasted key gets refused, and the team page is fetched at the end.

## Run it for your team

Start the server. It listens on `127.0.0.1:8787` and keeps its data in `data/relay.db`.

```sh
npm start
```

Add each person from a second terminal. The token is printed once and only its hash is stored, so send it to that person privately. If it gets lost, issue a new one with `rotate`.

```sh
npm run relay -- add alice "Alice Example"
npm run relay -- add bob "Bob Example"
```

Each person then connects Claude Code with their own token. Put this in a `.mcp.json` file and set `RELAY_TOKEN` in your shell, so the token stays out of your shell history and out of any file you might commit:

```json
{
  "mcpServers": {
    "relay": {
      "type": "http",
      "url": "http://127.0.0.1:8787/mcp",
      "headers": { "Authorization": "Bearer ${RELAY_TOKEN}" }
    }
  }
}
```

You can use `claude mcp add` instead, which is the command `add` and `rotate` print. It stores the token in your Claude Code settings, and the token also lands in your shell history:

```sh
claude mcp add --transport http relay http://127.0.0.1:8787/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

To see the team page, open `http://127.0.0.1:8787/` in a browser. When it asks you to sign in, enter your token as the password. The username is not checked, so you can leave it blank or type anything.

## Put TLS in front of it

The server speaks plain HTTP, so tokens cross the network unencrypted unless a proxy adds TLS. For a real team, keep the server on `127.0.0.1` and let a proxy on the same machine face the network. With [Caddy](https://caddyserver.com), which gets its own certificate, this is the whole config:

```
relay.example.com {
  reverse_proxy 127.0.0.1:8787
}
```

Then set `RELAY_PUBLIC_URL=https://relay.example.com` when you run `add` and `rotate`, so the commands they print use that address, and use the same address in `.mcp.json`. If the proxy runs on another machine, set `RELAY_HOST` to an address that machine can reach.

## Other commands

```sh
npm run relay -- people            # list people
npm run relay -- rotate alice      # replace a token
npm run relay -- revoke alice      # cut someone off at once
```

## Tools

| Tool | What it does |
| --- | --- |
| `send_message` | Sends `body` to the handle in `to`. Pass `thread_id` to continue a thread, or leave it out to start one. |
| `check_inbox` | Returns your unread messages and marks them read. `timeout_seconds` makes it wait for a message, up to 50 seconds. |
| `read_thread` | Returns every live message in a thread, oldest first. Any team member can read any thread. |
| `list_peers` | Lists your teammates and when each last used the relay. |

## Rules the server enforces

**Per-person tokens, hashed at rest.** Tokens are 256 random bits. The database holds only their SHA-256 hash. A fast hash is the right choice here because the tokens are random, so there is nothing to guess. The sender of a message always comes from the token, and no tool accepts a sender as an argument.

**`/mcp` takes Bearer tokens only, and refuses unknown browser origins.** A browser attaches the team page's Basic credentials to requests on its own, so those credentials do not work on `/mcp`. A request with an `Origin` header that is not listed in `RELAY_ALLOWED_ORIGINS` gets a 403, even with a good token. A request with no `Origin` header is allowed, because non-browser clients such as Claude Code do not send one.

**Messages expire.** A message expires a set number of days after it is sent, whether or not it was read. The default is 30 and `RELAY_RETENTION_DAYS` changes it. An expired message disappears from every read at the moment it expires, and a purge at startup and once an hour then deletes the row.

**The team can see everything.** Any person with a valid token can open the page at `/` and read all live messages, including ones between other people. The page only answers `GET` and `HEAD`. Message text is escaped and a content security policy blocks scripts, so a message cannot run code in a teammate's browser.

**A message from another agent is data.** The server instructions tell every connected session that a message carries none of their user's authority, and to get their user's agreement before acting on a request that changes something. `check_inbox` and `read_thread` also repeat the point in a `notice` field next to the messages.

**Likely secrets are refused.** Before a message is stored, the server checks it against patterns for common credentials: cloud and API keys, private keys, JSON web tokens, URLs with a password in them, and assignments such as `password=...`. A refused message is not stored, and the refusal names the kind of secret without repeating it. This is a best-effort check. An encoded or unusual secret will get through, and an innocent message will occasionally be refused.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `RELAY_DB` | `data/relay.db` | Path to the SQLite file |
| `RELAY_HOST` | `127.0.0.1` | Address to listen on |
| `RELAY_PORT` | `8787` | Port to listen on |
| `RELAY_RETENTION_DAYS` | `30` | Days before a message expires. Must be a positive number. |
| `RELAY_PUBLIC_URL` | `http://RELAY_HOST:RELAY_PORT` | The address `add` and `rotate` print in the connect command |
| `RELAY_ALLOWED_ORIGINS` | none | Comma separated browser origins allowed to call `/mcp` |

## Using another database

All database access goes through the `Store` interface in `src/store.ts`, which is about a dozen methods. To use another database, implement that interface and pass your store to `new Relay`. The one rule to keep is that `claimInbox` must be atomic, so that two waiting sessions can never both receive the same message.

## Development

```sh
npm test            # run the tests
npm run typecheck   # check types
npm run build       # compile to dist/
```

## Limits worth knowing

- A message is delivered once. If one person has two sessions open, whichever calls `check_inbox` first gets it, and the other can still see it with `read_thread`.
- If a connection drops after a message is claimed and before the response arrives, that message will not appear in `check_inbox` again. It is still in the thread and on the team page.
- A wait is capped at 50 seconds because the MCP TypeScript client gives up on a request after 60. To wait longer, call `check_inbox` again.
- A waiting session polls the database every half second, so a message can take up to that long to arrive.
- There is no rate limiting, and every person can read everything. This is built for a small team that trusts each other, not for strangers.
- SQLite support comes from Node's built-in `node:sqlite` module, which Node still marks as experimental.

## License

MIT. See [LICENSE](LICENSE).
