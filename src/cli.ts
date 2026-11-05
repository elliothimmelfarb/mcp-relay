#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { createHttpServer } from "./http.js";
import { Relay, RelayError } from "./relay.js";
import { SqliteStore } from "./sqlite-store.js";

const HOUR_MS = 60 * 60 * 1000;
const USAGE = `Usage:
  mcp-relay serve                    Run the server
  mcp-relay add <handle> [name]      Add a person and print their token once
  mcp-relay rotate <handle>          Replace a person's token
  mcp-relay revoke <handle>          Cut a person off
  mcp-relay people                   List people`;

function serve(relay: Relay, host: string, port: number) {
  relay.purge();
  const purgeTimer = setInterval(() => relay.purge(), HOUR_MS);
  purgeTimer.unref();

  const server = createHttpServer(relay);
  server.listen(port, host, () => {
    console.log(`mcp-relay listening on http://${host}:${port}`);
    console.log(`  MCP endpoint: /mcp   Team page: /   Retention: ${relay.retentionDays} days`);
    if (relay.listPeople().length === 0) {
      console.log("  Nobody is set up yet. Run: npm run relay -- add <handle>");
    }
    if (!["127.0.0.1", "::1", "localhost"].includes(host)) {
      console.log("  Warning: this is plain HTTP. Put TLS in front of it before using a network.");
    }
  });

  const stop = () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

function printToken(handle: string, token: string, host: string, port: number) {
  console.log(`Token for ${handle}. It is shown only this once:\n\n  ${token}\n`);
  console.log("Connect Claude Code with:\n");
  console.log(
    `  claude mcp add --transport http relay http://${host}:${port}/mcp ` +
      `--header "Authorization: Bearer ${token}"`,
  );
}

function main() {
  const [command, handle, ...nameParts] = process.argv.slice(2);
  const config = loadConfig();
  const needHandle = () => {
    if (!handle) throw new RelayError(USAGE);
    return handle;
  };

  if (!["serve", "add", "rotate", "revoke", "people"].includes(command ?? "")) {
    console.log(USAGE);
    process.exitCode = command ? 1 : 0;
    return;
  }

  const store = new SqliteStore(config.dbPath);
  const relay = new Relay({ store, retentionDays: config.retentionDays });

  if (command === "serve") return serve(relay, config.host, config.port);
  try {
    if (command === "add") {
      const { token } = relay.addPerson(needHandle(), nameParts.join(" ") || needHandle());
      printToken(needHandle(), token, config.host, config.port);
    } else if (command === "rotate") {
      printToken(needHandle(), relay.rotate(needHandle()), config.host, config.port);
    } else if (command === "revoke") {
      relay.revoke(needHandle());
      console.log(`Revoked ${handle}.`);
    } else {
      for (const person of relay.listPeople()) console.log(`${person.handle}\t${person.name}`);
    }
  } finally {
    store.close();
  }
}

try {
  main();
} catch (error) {
  if (!(error instanceof RelayError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
}
