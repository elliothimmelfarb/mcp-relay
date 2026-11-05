import { describe, expect, it } from "vitest";
import { parseRetentionDays } from "../src/config.js";
import { DAY, setup } from "./helpers.js";

describe("expiry", () => {
  it("delivers a message up to the moment before it expires", async () => {
    const { relay, clock } = setup({ retentionDays: 7 });
    relay.send("alice", { to: "bob", body: "hi" });
    clock.now += 7 * DAY - 1;
    expect(await relay.checkInbox("bob")).toHaveLength(1);
  });

  it("treats a message as gone at the exact expiry time in inbox, thread and team log", async () => {
    const { relay, clock } = setup({ retentionDays: 7 });
    const sent = relay.send("alice", { to: "bob", body: "hi" });
    clock.now += 7 * DAY;
    expect(await relay.checkInbox("bob")).toEqual([]);
    expect(relay.readThread(sent.threadId)).toEqual([]);
    expect(relay.teamLog()).toEqual([]);
  });

  it("honours the configured retention", async () => {
    const { relay, clock } = setup({ retentionDays: 1 });
    relay.send("alice", { to: "bob", body: "hi" });
    clock.now += DAY;
    expect(await relay.checkInbox("bob")).toEqual([]);
  });

  it("supports a fractional number of days", () => {
    const { relay } = setup({ retentionDays: 0.5 });
    const sent = relay.send("alice", { to: "bob", body: "hi" });
    expect(sent.expiresAt - sent.createdAt).toBe(DAY / 2);
  });

  it("physically removes expired rows on purge and leaves live ones", () => {
    const { relay, store, clock } = setup({ retentionDays: 7 });
    const old = relay.send("alice", { to: "bob", body: "old" });
    clock.now += 3 * DAY;
    const live = relay.send("alice", { to: "bob", body: "live" });
    clock.now += 4 * DAY;
    expect(relay.purge()).toBe(1);
    expect(store.thread(old.threadId, 0)).toEqual([]);
    expect(store.thread(live.threadId, 0)).toHaveLength(1);
  });

  it("refuses a reply into a thread that has fully expired", () => {
    const { relay, clock } = setup({ retentionDays: 7 });
    const sent = relay.send("alice", { to: "bob", body: "hi" });
    clock.now += 7 * DAY;
    expect(() => relay.send("bob", { to: "alice", body: "late", threadId: sent.threadId })).toThrow(
      /no such thread/i,
    );
  });

  it.each(["", "abc", "0", "-3", "Infinity"])("rejects a retention setting of %j", (value) => {
    expect(() => parseRetentionDays(value)).toThrow(/RELAY_RETENTION_DAYS/);
  });

  it("defaults retention when unset and parses a valid value", () => {
    expect(parseRetentionDays(undefined)).toBe(30);
    expect(parseRetentionDays("14")).toBe(14);
  });
});
