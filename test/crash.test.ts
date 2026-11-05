import type { ChildProcess } from "node:child_process";
import { connect } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpServer } from "../src/http.js";
import { startCli } from "./cli-server.js";
import { setup } from "./helpers.js";

const children: ChildProcess[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const child of children.splice(0)) child.kill();
});

/** Writes bytes a fetch client would refuse to send, and returns whatever comes back. */
function raw(port: number, target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let received = "";
    const socket = connect(port, "127.0.0.1", () =>
      socket.write(`GET ${target} HTTP/1.1\r\nHost: relay\r\nConnection: close\r\n\r\n`),
    );
    socket.on("data", (chunk) => (received += chunk));
    socket.on("close", () => resolve(received));
    socket.on("error", reject);
  });
}

describe("a request target that is not a URL", () => {
  it.each(["//", "//[", "http://[", "http://", "//a:b", "//:", "http://a:b/"])(
    "answers 400 to %s and stays up",
    async (target) => {
      const { child, port } = await startCli();
      children.push(child);
      expect((await raw(port, target)).split("\r\n")[0]).toBe("HTTP/1.1 400 Bad Request");
      expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(401);
      expect(child.exitCode).toBeNull();
    },
  );
});

describe("the last resort", () => {
  async function listening(context: ReturnType<typeof setup>) {
    const server = createHttpServer(context.relay);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    const stop = () => {
      server.closeAllConnections();
      server.close();
      context.store.close();
    };
    return { port, stop };
  }

  it("drops the connection when the error path itself fails", async () => {
    const context = setup();
    vi.spyOn(context.relay, "authenticate").mockImplementation(() => {
      throw new Error("boom");
    });
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("logging is broken");
    });
    const { port, stop } = await listening(context);
    expect(await raw(port, "/")).toBe("");
    stop();
  });

  it("logs a per-request MCP server that fails to close instead of leaving the rejection loose", async () => {
    vi.spyOn(McpServer.prototype, "close").mockRejectedValue(new Error("close failed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const context = setup();
    const { port, stop } = await listening(context);
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${context.alice.token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    await response.text();
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith("request failed:", "close failed"));
    stop();
  });
});
