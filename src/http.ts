import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildMcpServer } from "./mcp.js";
import { renderTeamPage } from "./page.js";
import type { Relay } from "./relay.js";

const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function tokenFrom(header: string | undefined): string {
  if (!header) return "";
  const [scheme, value = ""] = header.split(" ", 2);
  if (scheme?.toLowerCase() === "bearer") return value;
  if (scheme?.toLowerCase() === "basic") {
    const decoded = Buffer.from(value, "base64").toString();
    return decoded.slice(decoded.indexOf(":") + 1);
  }
  return "";
}

function send(res: ServerResponse, status: number, text: string, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", ...headers });
  res.end(text);
}

async function handleMcp(relay: Relay, req: IncomingMessage, res: ServerResponse) {
  const caller = relay.authenticate(tokenFrom(req.headers.authorization));
  if (!caller) {
    send(res, 401, "A valid bearer token is required.\n", { "www-authenticate": "Bearer" });
    return;
  }
  // Stateless: a fresh server and transport per request, and no GET stream, since
  // nothing here pushes to the client. A wait is one long POST.
  if (req.method !== "POST") {
    send(res, 405, "Use POST.\n", { allow: "POST" });
    return;
  }
  const server = buildMcpServer(relay, caller);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  // Closing the transport aborts a running check_inbox, so that a client that
  // hangs up mid-wait does not consume messages it can no longer receive.
  res.on("close", () => void server.close());
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

function handlePage(relay: Relay, req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "This page is read-only.\n", { allow: "GET, HEAD" });
    return;
  }
  // HTTP Basic, with the token as the password, gives browsers a built-in prompt.
  // That means no login form, no session cookie, and nothing that can change state.
  if (!relay.authenticate(tokenFrom(req.headers.authorization))) {
    send(res, 401, "Sign in with your handle and relay token.\n", {
      "www-authenticate": 'Basic realm="mcp-relay", charset="UTF-8"',
    });
    return;
  }
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": CSP,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cache-control": "no-store",
  });
  res.end(renderTeamPage(relay.teamLog(), relay.listPeople(), relay.retentionDays));
}

export function createHttpServer(relay: Relay): Server {
  return createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://relay").pathname;
    const handled = (async () => {
      if (path === "/mcp") await handleMcp(relay, req, res);
      else if (path === "/") handlePage(relay, req, res);
      else send(res, 404, "Not found.\n");
    })();
    handled.catch((error) => {
      // Never log request bodies: they may hold the text the secret check is there to stop.
      console.error("request failed:", error instanceof Error ? error.message : error);
      if (!res.headersSent) send(res, 500, "Internal error.\n");
      else res.destroy();
    });
  });
}
