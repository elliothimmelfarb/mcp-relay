/** A team member. The token itself is never stored, only its hash. */
export interface Person {
  handle: string;
  name: string;
  createdAt: number;
  lastSeenAt: number | null;
  revokedAt: number | null;
}

export interface Message {
  /** Insertion order. This, not a timestamp, is what orders a thread. */
  seq: number;
  id: string;
  threadId: string;
  from: string;
  to: string;
  body: string;
  createdAt: number;
  expiresAt: number;
  readAt: number | null;
}

export type NewMessage = Omit<Message, "seq" | "readAt">;

/**
 * Everything the relay needs from a database. Times are milliseconds since the
 * epoch. Methods that take `now` must hide messages whose expiresAt <= now.
 * To use another database, implement this and pass it to `new Relay`.
 */
export interface Store {
  addPerson(person: Pick<Person, "handle" | "name" | "createdAt">, tokenHash: string): void;
  /** Replaces the token hash and clears any revocation. Returns false if no such person. */
  setTokenHash(handle: string, tokenHash: string): boolean;
  /** Returns false if no such person. */
  revokePerson(handle: string, at: number): boolean;
  /** Returns undefined for an unknown hash or a revoked person. */
  personByTokenHash(tokenHash: string): Person | undefined;
  touchPerson(handle: string, at: number): void;
  /** Includes revoked people, so callers decide what to show. */
  listPeople(): Person[];

  insertMessage(message: NewMessage): Message;
  /** Atomically marks unread messages as read and returns them in seq order. */
  claimInbox(handle: string, now: number): Message[];
  /** All live messages in a thread, in seq order. */
  thread(threadId: string, now: number): Message[];
  /** The most recent live messages, newest first. */
  recent(limit: number, now: number): Message[];
  /** Deletes expired rows and returns how many were removed. */
  purgeExpired(now: number): number;

  close(): void;
}
