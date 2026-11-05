import { createHash, randomBytes } from "node:crypto";

/** 256 random bits. The prefix lets the secret check and scanners recognise one. */
export function newToken(): string {
  return `mrt_${randomBytes(32).toString("base64url")}`;
}

/**
 * Plain SHA-256 is the right hash here. Tokens are long and random, so there is
 * nothing to brute force, and a slow password hash would only slow every request.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
