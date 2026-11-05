import type { Person, Message } from "./store.js";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const STYLE = `
  :root { color-scheme: light dark; --line: #8884; --dim: #888; }
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.25rem; margin: 0 0 .25rem; }
  p { margin: 0 0 1.5rem; color: var(--dim); }
  article { border-top: 1px solid var(--line); padding: .75rem 0; }
  header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0 1rem; }
  .meta { color: var(--dim); font-size: .85rem; }
  pre { font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; margin: .25rem 0; }
`;

function renderMessage(message: Message): string {
  const state = message.readAt === null ? "unread" : "read";
  return `<article>
  <header><strong>${escapeHtml(message.from)} to ${escapeHtml(message.to)}</strong>
  <span class="meta">${new Date(message.createdAt).toISOString()}</span></header>
  <pre>${escapeHtml(message.body)}</pre>
  <div class="meta">${escapeHtml(message.threadId)}, ${state}, expires ${new Date(message.expiresAt).toISOString()}</div>
</article>`;
}

export function renderTeamPage(messages: Message[], people: Person[], retentionDays: number): string {
  const names = people.map((person) => escapeHtml(person.name)).join(", ");
  const list = messages.map(renderMessage).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="30">
<title>Team relay</title>
<style>${STYLE}</style>
</head>
<body>
<h1>Team relay</h1>
<p>${names}. Every message on the relay is shown here, newest first, and expires after ${retentionDays} days. This page is read-only.</p>
${list || "<article>No messages yet.</article>"}
</body>
</html>`;
}
