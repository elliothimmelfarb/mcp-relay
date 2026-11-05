import { describe, expect, it } from "vitest";
import { setup } from "./helpers.js";

describe("check_inbox wait", () => {
  it("returns immediately with no wait", async () => {
    const { relay } = setup();
    const started = performance.now();
    expect(await relay.checkInbox("bob")).toEqual([]);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it("returns empty when the wait runs out, and not early", async () => {
    const { relay } = setup();
    const started = performance.now();
    expect(await relay.checkInbox("bob", 150)).toEqual([]);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(140);
    expect(elapsed).toBeLessThan(1_000);
  });

  it("wakes as soon as a message arrives, well before the wait ends", async () => {
    const { relay } = setup();
    const started = performance.now();
    const waiting = relay.checkInbox("bob", 1_900);
    setTimeout(() => relay.send("alice", { to: "bob", body: "hi" }), 30);
    expect((await waiting).map((m) => m.body)).toEqual(["hi"]);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("caps a requested wait at the server maximum", async () => {
    const { relay } = setup({ maxWaitMs: 100 });
    const started = performance.now();
    await relay.checkInbox("bob", 60_000);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("ignores messages for someone else while waiting", async () => {
    const { relay } = setup();
    const waiting = relay.checkInbox("bob", 100);
    relay.send("bob", { to: "alice", body: "not for bob" });
    expect(await waiting).toEqual([]);
  });

  it("delivers a message once, even to two simultaneous waiters", async () => {
    const { relay } = setup();
    const waiters = [relay.checkInbox("bob", 200), relay.checkInbox("bob", 200)];
    relay.send("alice", { to: "bob", body: "hi" });
    const results = await Promise.all(waiters);
    expect(results.flat()).toHaveLength(1);
    expect(await relay.checkInbox("bob")).toEqual([]);
  });

  it("stops promptly on abort and leaves later messages unread", async () => {
    const { relay } = setup();
    const controller = new AbortController();
    const started = performance.now();
    const waiting = relay.checkInbox("bob", 1_900, controller.signal);
    setTimeout(() => controller.abort(), 20);
    expect(await waiting).toEqual([]);
    expect(performance.now() - started).toBeLessThan(500);
    relay.send("alice", { to: "bob", body: "hi" });
    expect(await relay.checkInbox("bob")).toHaveLength(1);
  });
});
