// Runs a real server on a spare port with a throwaway database, then connects two
// MCP clients over HTTP, each with its own token, and has them talk.
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHttpServer } from "./http.js";
import { Relay } from "./relay.js";
import { SqliteStore } from "./sqlite-store.js";

const dir = mkdtempSync(join(tmpdir(), "mcp-relay-demo-"));
const store = new SqliteStore(join(dir, "relay.db"));
const relay = new Relay({ store, retentionDays: 30, pollMs: 50 });
const alice = relay.addPerson("alice", "Alice");
const bob = relay.addPerson("bob", "Bob");

const server = createHttpServer(relay);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function session(token: string) {
  const client = new Client({ name: "demo", version: "1" });
  const headers = { Authorization: `Bearer ${token}` };
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers } }),
  );
  return async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { text: string }[])[0]!.text;
    return result.isError ? { refused: text } : JSON.parse(text);
  };
}

const say = (who: string, text: string) => console.log(`${who.padEnd(6)} ${text}`);

try {
  const aliceCalls = await session(alice.token);
  const bobCalls = await session(bob.token);
  console.log(`Server running at ${base} with two sessions connected.\n`);

  const { peers } = await aliceCalls("list_peers");
  say("alice", `list_peers: ${peers.map((p: { handle: string }) => p.handle).join(", ")}`);

  say("bob", "check_inbox, waiting up to 10 seconds");
  const bobInbox = bobCalls("check_inbox", { timeout_seconds: 10 });
  await new Promise((resolve) => setTimeout(resolve, 200));

  const question = "Which field holds the customer id on the orders table?";
  const sent = await aliceCalls("send_message", { to: "bob", body: question });
  say("alice", `send_message: "${question}"`);

  const received = (await bobInbox).messages[0];
  say("bob", `received from ${received.from}: "${received.body}"`);

  say("alice", "check_inbox, waiting up to 10 seconds");
  const aliceInbox = aliceCalls("check_inbox", { timeout_seconds: 10 });
  await new Promise((resolve) => setTimeout(resolve, 200));

  const answer = "It is orders.customer_ref. The old customer_id column is unused.";
  await bobCalls("send_message", { to: "alice", body: answer, thread_id: received.thread_id });
  say("bob", `send_message: "${answer}"`);
  say("alice", `received: "${(await aliceInbox).messages[0].body}"`);

  const thread = await aliceCalls("read_thread", { thread_id: sent.thread_id });
  console.log(`\nread_thread ${sent.thread_id}:`);
  thread.messages.forEach((m: { from: string; body: string }, index: number) =>
    console.log(`  ${index + 1}. ${m.from}: ${m.body}`),
  );
  console.log(`\nEvery result like that one carries this notice:\n  ${thread.notice}`);

  const pasted = "Try this: " + ["sk", "live", "x".repeat(24)].join("_");
  const refused = await aliceCalls("send_message", { to: "bob", body: pasted });
  console.log(`\nAlice pastes a key by accident. The server answers:\n  ${refused.refused}`);

  const authorization = `Basic ${Buffer.from(`bob:${bob.token}`).toString("base64")}`;
  const page = await fetch(base, { headers: { authorization } });
  const shown = (await page.text()).includes("customer_ref");
  console.log(`\nTeam page at ${base}/ answered ${page.status}. Conversation visible: ${shown}.`);
  console.log(`A request with no token gets ${(await fetch(`${base}/mcp`, { method: "POST" })).status}.`);
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
