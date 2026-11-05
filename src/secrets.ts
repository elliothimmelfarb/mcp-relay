// A best-effort check, not a guarantee. It catches the common accident of
// pasting a credential. An encoded or unusual secret will get through.
const PATTERNS: [label: string, pattern: RegExp][] = [
  ["a private key", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/],
  ["an AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["a GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/],
  ["an API key", /\bsk-(?:ant-|proj-)[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{32,}/],
  ["a Stripe secret", /\b(?:[sr]k_live_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9+/=]{16,})/],
  ["a Slack token", /\bxox[abeoprs]-[A-Za-z0-9-]{10,}/],
  ["a Google API key", /\bAIza[A-Za-z0-9_-]{35}/],
  ["a JSON web token", /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ["a relay token", /\bmrt_[A-Za-z0-9_-]{43}/],
  ["a URL with a password in it", /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s/@<$]+@/i],
  ["a bearer token", /\bbearer\s+[A-Za-z0-9._~+/-]{20,}/i],
  [
    "a secret assignment",
    /(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)["']?\s*[:=]\s*["']?[^\s"'<$]{8,}/i,
  ],
];

/** Returns a description of what was found, never the matched text itself. */
export function findSecret(text: string): string | undefined {
  return PATTERNS.find(([, pattern]) => pattern.test(text))?.[0];
}
