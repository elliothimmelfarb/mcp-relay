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

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    dbPath: env.RELAY_DB ?? "data/relay.db",
    host: env.RELAY_HOST ?? "127.0.0.1",
    port: Number(env.RELAY_PORT ?? 8787),
    retentionDays: parseRetentionDays(env.RELAY_RETENTION_DAYS),
  };
}
