import { describe, expect, it } from "vitest";
import { setup } from "./helpers.js";

const bodies = (messages: { body: string }[]) => messages.map((m) => m.body);

describe("thread ordering", () => {
  it("keeps send order when every message has the same timestamp", () => {
    const { relay } = setup();
    const first = relay.send("alice", { to: "bob", body: "1" });
    for (const body of ["2", "3", "4", "5"]) {
      relay.send("bob", { to: "alice", body, threadId: first.threadId });
    }
    expect(bodies(relay.readThread(first.threadId))).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("keeps send order when the clock steps backwards", () => {
    const { relay, clock } = setup();
    const first = relay.send("alice", { to: "bob", body: "1" });
    clock.now -= 60_000;
    relay.send("bob", { to: "alice", body: "2", threadId: first.threadId });
    expect(bodies(relay.readThread(first.threadId))).toEqual(["1", "2"]);
  });

  it("does not mix interleaved threads", () => {
    const { relay } = setup();
    const a = relay.send("alice", { to: "bob", body: "a1" });
    const b = relay.send("alice", { to: "bob", body: "b1" });
    relay.send("bob", { to: "alice", body: "a2", threadId: a.threadId });
    relay.send("bob", { to: "alice", body: "b2", threadId: b.threadId });
    expect(bodies(relay.readThread(a.threadId))).toEqual(["a1", "a2"]);
    expect(bodies(relay.readThread(b.threadId))).toEqual(["b1", "b2"]);
  });

  it("delivers an inbox batch in send order", async () => {
    const { relay } = setup();
    for (const body of ["1", "2", "3"]) relay.send("alice", { to: "bob", body });
    expect(bodies(await relay.checkInbox("bob"))).toEqual(["1", "2", "3"]);
  });

  it("starts a new thread when none is given and rejects an unknown one", () => {
    const { relay } = setup();
    const a = relay.send("alice", { to: "bob", body: "a" });
    const b = relay.send("alice", { to: "bob", body: "b" });
    expect(a.threadId).not.toBe(b.threadId);
    expect(() => relay.send("alice", { to: "bob", body: "c", threadId: "t_missing" })).toThrow(
      /no such thread/i,
    );
  });

  it("does not consume a person's inbox when a thread is read", async () => {
    const { relay } = setup();
    const sent = relay.send("alice", { to: "bob", body: "hi" });
    relay.readThread(sent.threadId);
    expect(await relay.checkInbox("bob")).toHaveLength(1);
  });

  it("marks read_at on the thread after delivery", async () => {
    const { relay, clock } = setup();
    const sent = relay.send("alice", { to: "bob", body: "hi" });
    expect(relay.readThread(sent.threadId)[0]?.readAt).toBeNull();
    await relay.checkInbox("bob");
    expect(relay.readThread(sent.threadId)[0]?.readAt).toBe(clock.now);
  });
});

describe("send validation", () => {
  it("refuses an empty body and an oversized body", () => {
    const { relay } = setup();
    expect(() => relay.send("alice", { to: "bob", body: "   " })).toThrow(/empty/);
    expect(() => relay.send("alice", { to: "bob", body: "x".repeat(8001) })).toThrow(/8000/);
  });

  it("names the valid handles when the recipient is unknown", () => {
    const { relay } = setup();
    expect(() => relay.send("alice", { to: "carol", body: "hi" })).toThrow(/bob/);
  });
});
