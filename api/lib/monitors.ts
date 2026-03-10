/**
 * Sentry Cron Monitor heartbeat for per-repo silence detection (SENT-03).
 *
 * Each enrolled repo gets a Sentry Cron Monitor that expects a check-in
 * every 7 days. If no webhook events are processed for a repo within that
 * window (+1 day grace period), Sentry creates a "missed" issue.
 *
 * Monitor slugs are derived from repo full names:
 *   "Liftitapp/geocoding-enterprise" -> "repo-liftitapp-geocoding-enterprise"
 */

import * as Sentry from '@sentry/node';

/**
 * Convert a GitHub repo full name to a valid Sentry monitor slug.
 *
 * Rules: lowercase, replace non-alphanumeric chars with hyphens,
 * collapse consecutive hyphens, trim trailing hyphens, prefix with "repo-".
 */
export function repoSlug(repoFullName: string): string {
  const sanitized = repoFullName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/-$/, '');

  return `repo-${sanitized}`;
}

/**
 * Emit a cron monitor heartbeat for the given repository.
 *
 * Uses a 7-day interval schedule. If Sentry doesn't receive a check-in
 * within 7 days (+checkinMargin), it creates a "missed" issue.
 */
export function emitRepoHeartbeat(repoFullName: string): void {
  const slug = repoSlug(repoFullName);

  Sentry.captureCheckIn(
    { monitorSlug: slug, status: 'ok' },
    {
      schedule: { type: 'interval', value: 7, unit: 'day' },
      checkinMargin: 1440,
      maxRuntime: 1,
      timezone: 'UTC',
      failureIssueThreshold: 1,
      recoveryThreshold: 1,
    },
  );
}
