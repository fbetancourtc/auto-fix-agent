/**
 * Redis-backed deduplication guard for GitHub webhook deliveries.
 *
 * Uses Upstash Redis SET NX with 24-hour TTL to detect duplicate
 * X-GitHub-Delivery IDs. Fail-open: if Redis is unreachable or
 * unconfigured, the event is processed (risk of duplicate metrics
 * is acceptable vs silently dropping events).
 */
import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

/**
 * Lazy singleton Redis client.
 * Returns null if UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN
 * environment variables are not configured.
 */
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

/**
 * Check if a delivery ID has already been processed.
 *
 * @returns true if this is a duplicate (already seen), false if new.
 * Fail-open: returns false on any error (processes event rather than dropping it).
 */
export async function isDuplicate(deliveryId: string): Promise<boolean> {
  try {
    const client = getRedis();
    if (!client) return false; // No Redis configured -- fail open

    // SET NX returns "OK" if key was set (new), null if key existed (duplicate)
    const result = await client.set(`dedup:${deliveryId}`, '1', { nx: true, ex: 86400 });
    return result === null; // null means key existed = duplicate
  } catch {
    return false; // Redis error -- fail open
  }
}

/**
 * Reset the singleton Redis client (for testing only).
 * @internal
 */
export function _resetRedisClient(): void {
  redis = null;
}
