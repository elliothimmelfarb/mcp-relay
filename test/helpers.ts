import { Relay } from "../src/relay.js";
import { SqliteStore } from "../src/sqlite-store.js";

export const DAY = 24 * 60 * 60 * 1000;
export const START = Date.UTC(2026, 0, 1);

export function setup(options: { retentionDays?: number; maxWaitMs?: number; path?: string } = {}) {
  const clock = { now: START };
  const store = new SqliteStore(options.path ?? ":memory:");
  const relay = new Relay({
    store,
    now: () => clock.now,
    retentionDays: options.retentionDays ?? 30,
    pollMs: 5,
    maxWaitMs: options.maxWaitMs ?? 2_000,
  });
  const alice = relay.addPerson("alice", "Alice");
  const bob = relay.addPerson("bob", "Bob");
  return { clock, store, relay, alice, bob };
}
