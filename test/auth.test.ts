import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { setup } from "./helpers.js";

describe("token auth", () => {
  it("resolves a token to the person it was issued to, and only that person", () => {
    const { relay, alice, bob } = setup();
    expect(relay.authenticate(alice.token)?.handle).toBe("alice");
    expect(relay.authenticate(bob.token)?.handle).toBe("bob");
  });

  it("rejects unknown, empty and near-miss tokens", () => {
    const { relay, alice } = setup();
    expect(relay.authenticate("nope")).toBeUndefined();
    expect(relay.authenticate("")).toBeUndefined();
    expect(relay.authenticate(alice.token.slice(0, -1))).toBeUndefined();
  });

  it("issues a different token to each person", () => {
    const { alice, bob } = setup();
    expect(alice.token).not.toBe(bob.token);
  });

  it("never writes the raw token to disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-auth-"));
    const { store, alice } = setup({ path: join(dir, "relay.db") });
    store.close();
    const bytes = readdirSync(dir).map((name) => readFileSync(join(dir, name)).toString("latin1"));
    expect(bytes.join("").length).toBeGreaterThan(0);
    expect(bytes.join("")).not.toContain(alice.token);
  });

  it("stops accepting a token as soon as it is revoked", () => {
    const { relay, alice } = setup();
    relay.revoke("alice");
    expect(relay.authenticate(alice.token)).toBeUndefined();
  });

  it("invalidates the old token on rotate and accepts the new one", () => {
    const { relay, alice } = setup();
    const fresh = relay.rotate("alice");
    expect(relay.authenticate(alice.token)).toBeUndefined();
    expect(relay.authenticate(fresh)?.handle).toBe("alice");
  });

  it("refuses a duplicate handle rather than replacing that person's token", () => {
    const { relay, alice } = setup();
    expect(() => relay.addPerson("alice", "Impostor")).toThrow(/already exists/);
    expect(relay.authenticate(alice.token)?.handle).toBe("alice");
  });

  it("does not list a revoked person as a peer or let them receive messages", () => {
    const { relay } = setup();
    relay.revoke("bob");
    expect(relay.listPeers("alice").map((p) => p.handle)).toEqual([]);
    expect(() => relay.send("alice", { to: "bob", body: "hi" })).toThrow(/unknown/i);
  });
});
