import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { CLI, tempDb } from "./cli-server.js";

describe("RELAY_ALLOWED_ORIGINS", () => {
  it("reads a comma separated list down to bare origins", () => {
    const value = "https://Team.example/, http://localhost:3000";
    expect(loadConfig({ RELAY_ALLOWED_ORIGINS: value }).allowedOrigins).toEqual([
      "https://team.example",
      "http://localhost:3000",
    ]);
  });

  it("stops startup on a value that could never match, rather than quietly refusing everyone", () => {
    for (const value of ["*", "team.example", "https://team.example/path"]) {
      expect(() => loadConfig({ RELAY_ALLOWED_ORIGINS: value }), value).toThrow(/RELAY_ALLOWED_ORIGINS/);
    }
  });
});

describe("the URL printed for a new person", () => {
  const add = (env: Record<string, string>) =>
    spawnSync(process.execPath, [...CLI, "add", "alice"], {
      env: { ...process.env, RELAY_DB: tempDb(), ...env },
      encoding: "utf8",
    });

  it("is RELAY_PUBLIC_URL when it is set", () => {
    const { stdout } = add({ RELAY_PUBLIC_URL: "https://relay.example.com/", RELAY_HOST: "0.0.0.0" });
    expect(stdout).toContain(" https://relay.example.com/mcp ");
  });

  it("falls back to the listen address", () => {
    expect(add({ RELAY_PORT: "9000" }).stdout).toContain(" http://127.0.0.1:9000/mcp ");
  });

  it("refuses a RELAY_PUBLIC_URL that is not http or https", () => {
    expect(() => loadConfig({ RELAY_PUBLIC_URL: "relay.example.com" })).toThrow(/RELAY_PUBLIC_URL/);
  });
});
