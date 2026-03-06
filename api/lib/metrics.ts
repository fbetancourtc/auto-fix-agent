/**
 * Centralized metric emission functions for the auto-fix pipeline.
 *
 * All Sentry metric names, tag structures, and units are defined here.
 * Handlers import these functions rather than calling Sentry.metrics directly.
 *
 * Note: Sentry v10 uses `Sentry.metrics.count()` (not `increment()`) and
 * `attributes` (not `tags`) for metric metadata.
 */
import * as Sentry from '@sentry/node';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { FixOutcome, MetricTags } from './types.js';

// Re-export types for consumer convenience
export type { FixOutcome, MetricTags } from './types.js';

// Load repo-stack-map.json at module scope (avoids ESM JSON import assertion issues)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoStackMapPath = resolve(__dirname, '../../config/repo-stack-map.json');

interface RepoConfig {
  stack: string;
  [key: string]: unknown;
}

interface RepoStackMap {
  repos: Record<string, RepoConfig>;
}

let repoStackMap: RepoStackMap;
try {
  repoStackMap = JSON.parse(readFileSync(repoStackMapPath, 'utf-8')) as RepoStackMap;
} catch {
  repoStackMap = { repos: {} };
}

/**
 * Build metric tags from a GitHub repository full name (e.g., "fbetancourtc/my-repo").
 * Looks up the stack type from repo-stack-map.json; defaults to 'unknown' if not found.
 */
export function buildMetricTags(repoFullName: string): MetricTags {
  const org = repoFullName.split('/')[0] ?? 'unknown';
  const repoConfig = repoStackMap.repos[repoFullName];
  const stack = repoConfig?.stack ?? 'unknown';
  return { repo: repoFullName, org, stack };
}

/**
 * Compute MTTR in milliseconds from PR creation time and workflow run start time.
 * Returns null if the result is negative or exceeds 24 hours (data issue).
 */
export function computeMttrMs(prCreatedAt: string, workflowRunStartedAt: string): number | null {
  const prTime = new Date(prCreatedAt).getTime();
  const failTime = new Date(workflowRunStartedAt).getTime();
  const mttr = prTime - failTime;
  if (mttr > 0 && mttr < 86_400_000) return mttr;
  return null;
}

/**
 * Estimate cost in USD from workflow run duration.
 * Formula: $0.50 base + $0.10 per minute.
 */
export function estimateCostUsd(runDurationMs: number): number {
  const BASE_COST = 0.50;
  const RATE_PER_MIN = 0.10;
  const durationMin = runDurationMs / 60_000;
  return BASE_COST + RATE_PER_MIN * durationMin;
}

// ---------------------------------------------------------------------------
// Metric emission functions
// ---------------------------------------------------------------------------

/** Increment trigger count when a workflow_run.completed event is processed. */
export function emitTriggerCount(tags: MetricTags): void {
  Sentry.metrics.count('auto_fix.trigger_count', 1, { attributes: tags });
}

/** Increment outcome counter for the given fix outcome category. */
export function emitOutcome(outcome: FixOutcome, tags: MetricTags): void {
  Sentry.metrics.count('auto_fix.outcome', 1, { attributes: { ...tags, outcome } });
}

/** Record workflow run duration as a distribution metric. */
export function emitRunDuration(durationMs: number, tags: MetricTags): void {
  Sentry.metrics.distribution('auto_fix.run_duration_ms', durationMs, {
    attributes: tags,
    unit: 'millisecond',
  });
}

/** Record mean-time-to-repair as a distribution metric. */
export function emitMTTR(mttrMs: number, tags: MetricTags): void {
  Sentry.metrics.distribution('auto_fix.mttr_ms', mttrMs, {
    attributes: tags,
    unit: 'millisecond',
  });
}

/** Record cost estimate as distribution and monthly spend as gauge. */
export function emitCostEstimate(costUsd: number, tags: MetricTags): void {
  Sentry.metrics.distribution('auto_fix.cost_per_fix_usd', costUsd, { attributes: tags });
  Sentry.metrics.gauge('auto_fix.monthly_spend_usd', costUsd, { attributes: tags });
}

/** Increment PR accepted counter. */
export function emitPrAccepted(tags: MetricTags): void {
  Sentry.metrics.count('auto_fix.pr_accepted', 1, { attributes: tags });
}

/** Increment PR rejected counter. */
export function emitPrRejected(tags: MetricTags): void {
  Sentry.metrics.count('auto_fix.pr_rejected', 1, { attributes: tags });
}

/** Increment circuit breaker trip safety counter. */
export function emitCircuitBreakerTrip(tags: MetricTags): void {
  Sentry.metrics.count('auto_fix.safety.circuit_breaker_trip', 1, { attributes: tags });
}

/** Increment scope violation safety counter. */
export function emitScopeViolation(tags: MetricTags): void {
  Sentry.metrics.count('auto_fix.safety.scope_violation', 1, { attributes: tags });
}

/** Increment escalation safety counter. */
export function emitEscalation(tags: MetricTags): void {
  Sentry.metrics.count('auto_fix.safety.escalation', 1, { attributes: tags });
}
