import { describe, expect, it } from "vitest";
import { findSecret } from "../src/secrets.js";
import { setup } from "./helpers.js";

// Assembled at runtime so that no complete fake credential sits in the source.
const x = (n: number) => "aB3dE6gH9k".repeat(Math.ceil(n / 10)).slice(0, n);
const SECRETS: [string, string][] = [
  ["AWS access key", "key is " + "AK" + "IA" + "QWERTYUIOPASDFGH"],
  ["GitHub token", "gh" + "p_" + x(36)],
  ["GitHub fine-grained token", "github" + "_pat_" + x(40)],
  ["Anthropic key", "sk" + "-ant-" + x(40)],
  ["OpenAI key", "sk" + "-proj-" + x(40)],
  ["Stripe key", "s" + "k_live_" + x(24)],
  ["Stripe webhook secret", "wh" + "sec_" + x(32)],
  ["Slack token", "xo" + "xb-" + "123456789012-" + x(20)],
  ["Google key", "AI" + "za" + x(35)],
  ["JWT", "ey" + "J" + x(12) + ".ey" + "J" + x(12) + "." + x(16)],
  ["private key block", "-----BEGIN RSA " + "PRIVATE KEY-----\n" + x(40)],
  ["relay token", "mr" + "t_" + x(43)],
  ["URL with password", "postgres://admin:" + x(12) + "@db.internal:5432/app"],
  ["bearer header", "Authorization: Bearer " + x(32)],
  ["env assignment", "DB_PASS" + "WORD=" + x(12)],
  ["json field", '{"api_key": "' + x(16) + '"}'],
];

const SAFE = [
  "Which column holds the customer id on the orders table?",
  "The password reset email goes out from the billing service.",
  "Use the token from your own env file, do not paste it here.",
  "Connect to postgres://db.internal:5432/app with your usual login.",
  "The connection string looks like postgres://user:<password>@host/db",
  "sk-learn is the package we use for the classifier.",
  "See https://example.com/docs/a-very-long-path/with-many/segments/here",
];

describe("secret check", () => {
  it.each(SECRETS)("catches %s", (_label, text) => {
    expect(findSecret(text)).toBeDefined();
  });

  it.each(SAFE)("lets through: %s", (text) => {
    expect(findSecret(text)).toBeUndefined();
  });

  it("gives the same answer on repeated calls", () => {
    const text = SECRETS[0]![1];
    expect([findSecret(text), findSecret(text), findSecret(text)]).toEqual(
      Array(3).fill(findSecret(text)),
    );
  });

  it("refuses the send, stores nothing, and does not echo the value", async () => {
    const { relay, store } = setup();
    const secret = "gh" + "p_" + x(36);
    let message = "";
    try {
      relay.send("alice", { to: "bob", body: `here you go: ${secret}` });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/refused/i);
    expect(message).not.toContain(secret);
    expect(await relay.checkInbox("bob")).toEqual([]);
    expect(store.recent(10, 0)).toEqual([]);
  });
});
