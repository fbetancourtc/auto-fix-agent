/**
 * Sentry initialization module.
 *
 * Sentry.init() is called at module scope so it executes once per cold start
 * and persists across warm invocations in Vercel serverless functions.
 */
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? 'development',
  // No tracing config -- Phase 5 is error capture only
});

export default Sentry;

/**
 * Flush Sentry's event buffer before the serverless function terminates.
 * Must be called inside waitUntil() to prevent silent data loss.
 */
export async function flushSentry(timeout?: number): Promise<void> {
  await Sentry.flush(timeout ?? 2000);
}
