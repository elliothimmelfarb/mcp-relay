import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Message, NewMessage, Person, Store } from "./store.js";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS people (
    handle       TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    created_at   INTEGER NOT NULL,
    last_seen_at INTEGER,
    revoked_at   INTEGER
  );
  CREATE TABLE IF NOT EXISTS messages (
    seq        INTEGER PRIMARY KEY AUTOINCREMENT,
    id         TEXT NOT NULL UNIQUE,
    thread_id  TEXT NOT NULL,
    sender     TEXT NOT NULL,
    recipient  TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    read_at    INTEGER
  );
  CREATE INDEX IF NOT EXISTS messages_inbox ON messages (recipient, read_at);
  CREATE INDEX IF NOT EXISTS messages_thread ON messages (thread_id, seq);
  CREATE INDEX IF NOT EXISTS messages_expiry ON messages (expires_at);
`;

type Row = Record<string, unknown>;

function toPerson(row: Row): Person {
  return {
    handle: row.handle as string,
    name: row.name as string,
    createdAt: row.created_at as number,
    lastSeenAt: row.last_seen_at as number | null,
    revokedAt: row.revoked_at as number | null,
  };
}

function toMessage(row: Row): Message {
  return {
    seq: row.seq as number,
    id: row.id as string,
    threadId: row.thread_id as string,
    from: row.sender as string,
    to: row.recipient as string,
    body: row.body as string,
    createdAt: row.created_at as number,
    expiresAt: row.expires_at as number,
    readAt: row.read_at as number | null,
  };
}

export class SqliteStore implements Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.db.exec(SCHEMA);
  }

  addPerson(person: Pick<Person, "handle" | "name" | "createdAt">, tokenHash: string): void {
    this.db
      .prepare("INSERT INTO people (handle, name, token_hash, created_at) VALUES (?, ?, ?, ?)")
      .run(person.handle, person.name, tokenHash, person.createdAt);
  }

  setTokenHash(handle: string, tokenHash: string): boolean {
    const result = this.db
      .prepare("UPDATE people SET token_hash = ?, revoked_at = NULL WHERE handle = ?")
      .run(tokenHash, handle);
    return result.changes > 0;
  }

  revokePerson(handle: string, at: number): boolean {
    const result = this.db
      .prepare("UPDATE people SET revoked_at = ? WHERE handle = ?")
      .run(at, handle);
    return result.changes > 0;
  }

  personByTokenHash(tokenHash: string): Person | undefined {
    const row = this.db
      .prepare("SELECT * FROM people WHERE token_hash = ? AND revoked_at IS NULL")
      .get(tokenHash);
    return row ? toPerson(row as Row) : undefined;
  }

  touchPerson(handle: string, at: number): void {
    this.db.prepare("UPDATE people SET last_seen_at = ? WHERE handle = ?").run(at, handle);
  }

  listPeople(): Person[] {
    const rows = this.db.prepare("SELECT * FROM people ORDER BY handle").all();
    return rows.map((row) => toPerson(row as Row));
  }

  insertMessage(message: NewMessage): Message {
    const row = this.db
      .prepare(
        `INSERT INTO messages (id, thread_id, sender, recipient, body, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(
        message.id,
        message.threadId,
        message.from,
        message.to,
        message.body,
        message.createdAt,
        message.expiresAt,
      );
    return toMessage(row as Row);
  }

  claimInbox(handle: string, now: number): Message[] {
    // A single statement, so two waiters can never both claim a message.
    // RETURNING has no guaranteed order, hence the sort.
    const rows = this.db
      .prepare(
        `UPDATE messages SET read_at = ?
         WHERE recipient = ? AND read_at IS NULL AND expires_at > ? RETURNING *`,
      )
      .all(now, handle, now);
    return rows.map((row) => toMessage(row as Row)).sort((a, b) => a.seq - b.seq);
  }

  thread(threadId: string, now: number): Message[] {
    const rows = this.db
      .prepare("SELECT * FROM messages WHERE thread_id = ? AND expires_at > ? ORDER BY seq")
      .all(threadId, now);
    return rows.map((row) => toMessage(row as Row));
  }

  recent(limit: number, now: number): Message[] {
    const rows = this.db
      .prepare("SELECT * FROM messages WHERE expires_at > ? ORDER BY seq DESC LIMIT ?")
      .all(now, limit);
    return rows.map((row) => toMessage(row as Row));
  }

  purgeExpired(now: number): number {
    const result = this.db.prepare("DELETE FROM messages WHERE expires_at <= ?").run(now);
    return Number(result.changes);
  }

  close(): void {
    this.db.close();
  }
}
