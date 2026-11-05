export const DEFAULT_RETENTION_DAYS = 30;

/** A bad value must stop startup: NaN here would make every message expire at once or never. */
export function parseRetentionDays(value: string | undefined): number {
  if (value === undefined) return DEFAULT_RETENTION_DAYS;
  const days = value.trim() === "" ? Number.NaN : Number(value);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error(`RELAY_RETENTION_DAYS must be a positive number of days, got "${value}"`);
  }
  return days;
}

/** A typo here must stop startup too: a value that can never match would refuse every browser client. */
function parseAllowedOrigins(value = ""): string[] {
  const entries = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return entries.map((entry) => {
    const url = URL.parse(entry);
    if (!url || url.origin === "null" || url.pathname !== "/" || url.search || url.hash) {
      throw new Error(`RELAY_ALLOWED_ORIGINS must list origins like https://team.example, got "${entry}"`);
    }
    return url.origin;
  });
}

function parsePublicUrl(value: string): string {
  const url = URL.parse(value);
  if (!url || !["http:", "https:"].includes(url.protocol)) {
    throw new Error(`RELAY_PUBLIC_URL must be an http or https URL, got "${value}"`);
  }
  return url.href.replace(/\/+$/, "");
}

export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const host = env.RELAY_HOST ?? "127.0.0.1";
  const port = Number(env.RELAY_PORT ?? 8787);
  return {
    dbPath: env.RELAY_DB ?? "data/relay.db",
    host,
    port,
    retentionDays: parseRetentionDays(env.RELAY_RETENTION_DAYS),
    allowedOrigins: parseAllowedOrigins(env.RELAY_ALLOWED_ORIGINS),
    publicUrl: env.RELAY_PUBLIC_URL
      ? parsePublicUrl(env.RELAY_PUBLIC_URL)
      : `http://${host.includes(":") ? `[${host}]` : host}:${port}`,
  };
}
