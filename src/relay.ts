import { randomBytes } from "node:crypto";
import { findSecret } from "./secrets.js";
import type { Message, Person, Store } from "./store.js";
import { hashToken, newToken } from "./tokens.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HANDLE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export const MAX_BODY_CHARS = 8000;
/** The MCP TypeScript client gives up after 60 seconds, so a wait has to end first. */
export const MAX_WAIT_MS = 50_000;

/** A problem with the request, safe to show to the caller. */
export class RelayError extends Error {}

export interface RelayOptions {
  store: Store;
  retentionDays: number;
  now?: () => number;
  pollMs?: number;
  maxWaitMs?: number;
}

export interface SendInput {
  to: string;
  body: string;
  threadId?: string;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
  });
}

export class Relay {
  readonly retentionDays: number;
  private readonly store: Store;
  private readonly now: () => number;
  private readonly pollMs: number;
  private readonly maxWaitMs: number;

  constructor(options: RelayOptions) {
    this.store = options.store;
    this.retentionDays = options.retentionDays;
    this.now = options.now ?? Date.now;
    this.pollMs = options.pollMs ?? 500;
    this.maxWaitMs = options.maxWaitMs ?? MAX_WAIT_MS;
  }

  /** Creates a person and returns their token. This is the only time it is available. */
  addPerson(handle: string, name: string): { handle: string; token: string } {
    if (!HANDLE.test(handle)) {
      throw new RelayError("A handle is 1 to 32 lowercase letters, digits, - or _.");
    }
    if (this.store.listPeople().some((person) => person.handle === handle)) {
      throw new RelayError(`${handle} already exists. Use rotate to issue a new token.`);
    }
    const token = newToken();
    this.store.addPerson({ handle, name, createdAt: this.now() }, hashToken(token));
    return { handle, token };
  }

  rotate(handle: string): string {
    const token = newToken();
    if (!this.store.setTokenHash(handle, hashToken(token))) {
      throw new RelayError(`Unknown person: ${handle}`);
    }
    return token;
  }

  revoke(handle: string): void {
    if (!this.store.revokePerson(handle, this.now())) {
      throw new RelayError(`Unknown person: ${handle}`);
    }
  }

  authenticate(token: string): Person | undefined {
    if (!token) return undefined;
    const person = this.store.personByTokenHash(hashToken(token));
    if (person) this.store.touchPerson(person.handle, this.now());
    return person;
  }

  private activePeople(): Person[] {
    return this.store.listPeople().filter((person) => person.revokedAt === null);
  }

  listPeers(handle: string): Person[] {
    return this.activePeople().filter((person) => person.handle !== handle);
  }

  listPeople(): Person[] {
    return this.activePeople();
  }

  send(from: string, input: SendInput): Message {
    const body = input.body;
    if (!body.trim()) throw new RelayError("The message is empty.");
    if (body.length > MAX_BODY_CHARS) {
      throw new RelayError(`The message is over the ${MAX_BODY_CHARS} character limit.`);
    }
    const secret = findSecret(body);
    if (secret) {
      throw new RelayError(
        `Refused: this looks like it contains ${secret}. Nothing was stored. ` +
          "Remove it and share the value another way.",
      );
    }
    const people = this.activePeople();
    if (!people.some((person) => person.handle === input.to)) {
      const handles = people.map((person) => person.handle).join(", ");
      throw new RelayError(`Unknown recipient "${input.to}". The team is: ${handles}.`);
    }
    const now = this.now();
    if (input.threadId && this.store.thread(input.threadId, now).length === 0) {
      throw new RelayError(`No such thread: ${input.threadId}. It may have expired.`);
    }
    return this.store.insertMessage({
      id: `m_${randomBytes(9).toString("base64url")}`,
      threadId: input.threadId ?? `t_${randomBytes(9).toString("base64url")}`,
      from,
      to: input.to,
      body,
      createdAt: now,
      expiresAt: now + this.retentionDays * DAY_MS,
    });
  }

  /**
   * Returns unread messages and marks them read, waiting up to waitMs for one to
   * arrive. It polls the store, so a wait also sees messages written by another
   * process, and there is no wake-up to miss.
   */
  async checkInbox(handle: string, waitMs = 0, signal?: AbortSignal): Promise<Message[]> {
    const deadline = performance.now() + Math.min(waitMs, this.maxWaitMs);
    for (;;) {
      // Check before claiming: a gone client must not consume messages it cannot receive.
      if (signal?.aborted) return [];
      const messages = this.store.claimInbox(handle, this.now());
      if (messages.length > 0) return messages;
      const remaining = deadline - performance.now();
      if (remaining <= 0) return [];
      await sleep(Math.min(this.pollMs, remaining), signal);
    }
  }

  readThread(threadId: string): Message[] {
    return this.store.thread(threadId, this.now());
  }

  /** Newest first. Backs the team page. */
  teamLog(limit = 500): Message[] {
    return this.store.recent(limit, this.now());
  }

  purge(): number {
    return this.store.purgeExpired(this.now());
  }
}
