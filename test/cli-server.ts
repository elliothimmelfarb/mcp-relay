import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CLI = ["--import", "tsx", "--disable-warning=ExperimentalWarning", "src/cli.ts"];

export function tempDb(): string {
  return join(mkdtempSync(join(tmpdir(), "relay-cli-")), "relay.db");
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** The real server in its own process, because a crash there must not be hidden by the test runner. */
export async function startCli(): Promise<{ child: ChildProcess; port: number }> {
  const port = await freePort();
  const child = spawn(process.execPath, [...CLI, "serve"], {
    env: { ...process.env, RELAY_DB: tempDb(), RELAY_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    child.stdout!.on("data", (chunk) => String(chunk).includes("listening") && resolve());
    child.once("exit", () => reject(new Error("The server exited during startup.")));
  });
  return { child, port };
}
