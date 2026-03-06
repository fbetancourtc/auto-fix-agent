import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @sentry/node before importing metrics module
vi.mock('@sentry/node', () => ({
  metrics: {
    count: vi.fn(),
    distribution: vi.fn(),
    gauge: vi.fn(),
  },
}));

// Mock fs.readFileSync to return a test repo-stack-map
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() =>
    JSON.stringify({
      repos: {
        'fbetancourtc/laundry-admin-dash': { stack: 'typescript' },
        'Liftitapp/geocoding-enterprise': { stack: 'typescript' },
        'LiftitFinOps/conciliacion-averias': { stack: 'python' },
      },
    }),
  ),
}));

import * as Sentry from '@sentry/node';
import {
  buildMetricTags,
  computeMttrMs,
  estimateCostUsd,
  emitTriggerCount,
  emitOutcome,
  emitRunDuration,
  emitMTTR,
  emitCostEstimate,
  emitPrAccepted,
  emitPrRejected,
  emitCircuitBreakerTrip,
  emitScopeViolation,
  emitEscalation,
} from '../api/lib/metrics.js';
import type { FixOutcome, MetricTags } from '../api/lib/types.js';

const testTags: MetricTags = { repo: 'fbetancourtc/test-repo', org: 'fbetancourtc', stack: 'typescript' };

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// buildMetricTags
// ---------------------------------------------------------------------------

describe('buildMetricTags', () => {
  it('returns correct tags for a known repo', () => {
    const tags = buildMetricTags('fbetancourtc/laundry-admin-dash');
    expect(tags).toEqual({
      repo: 'fbetancourtc/laundry-admin-dash',
      org: 'fbetancourtc',
      stack: 'typescript',
    });
  });

  it('returns stack "unknown" for an unrecognized repo', () => {
    const tags = buildMetricTags('unknown-org/unknown-repo');
    expect(tags).toEqual({
      repo: 'unknown-org/unknown-repo',
      org: 'unknown-org',
      stack: 'unknown',
    });
  });

  it('extracts org from different organizations', () => {
    const tags = buildMetricTags('LiftitFinOps/conciliacion-averias');
    expect(tags.org).toBe('LiftitFinOps');
    expect(tags.stack).toBe('python');
  });
});

// ---------------------------------------------------------------------------
// computeMttrMs
// ---------------------------------------------------------------------------

describe('computeMttrMs', () => {
  it('returns positive ms for valid inputs', () => {
    const prCreated = '2026-03-06T10:30:00Z';
    const failureStart = '2026-03-06T10:00:00Z';
    const result = computeMttrMs(prCreated, failureStart);
    expect(result).toBe(30 * 60 * 1000); // 30 minutes in ms
  });

  it('returns null for negative MTTR (pr created before failure)', () => {
    const prCreated = '2026-03-06T09:00:00Z';
    const failureStart = '2026-03-06T10:00:00Z';
    expect(computeMttrMs(prCreated, failureStart)).toBeNull();
  });

  it('returns null for MTTR exceeding 24 hours', () => {
    const prCreated = '2026-03-08T10:00:00Z';
    const failureStart = '2026-03-06T10:00:00Z';
    expect(computeMttrMs(prCreated, failureStart)).toBeNull();
  });

  it('returns value for MTTR just under 24 hours', () => {
    const failureStart = '2026-03-06T00:00:00Z';
    const prCreated = '2026-03-06T23:59:00Z';
    const result = computeMttrMs(prCreated, failureStart);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(86_400_000);
  });
});

// ---------------------------------------------------------------------------
// estimateCostUsd
// ---------------------------------------------------------------------------

describe('estimateCostUsd', () => {
  it('returns base cost for zero duration', () => {
    expect(estimateCostUsd(0)).toBe(0.50);
  });

  it('returns correct cost for 5 minutes', () => {
    const fiveMinMs = 5 * 60_000;
    // 0.50 + 0.10 * 5 = 1.00
    expect(estimateCostUsd(fiveMinMs)).toBe(1.00);
  });

  it('returns correct cost for 10 minutes', () => {
    const tenMinMs = 10 * 60_000;
    // 0.50 + 0.10 * 10 = 1.50
    expect(estimateCostUsd(tenMinMs)).toBe(1.50);
  });
});

// ---------------------------------------------------------------------------
// emitTriggerCount
// ---------------------------------------------------------------------------

describe('emitTriggerCount', () => {
  it('calls Sentry.metrics.count with correct metric name and attributes', () => {
    emitTriggerCount(testTags);
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      'auto_fix.trigger_count',
      1,
      { attributes: testTags },
    );
  });
});

// ---------------------------------------------------------------------------
// emitOutcome
// ---------------------------------------------------------------------------

describe('emitOutcome', () => {
  const outcomes: FixOutcome[] = [
    'fix_pr_created',
    'no_fix',
    'escalated',
    'flaky_skipped',
    'circuit_breaker',
  ];

  it.each(outcomes)('calls count for outcome "%s" with correct attributes', (outcome) => {
    emitOutcome(outcome, testTags);
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      'auto_fix.outcome',
      1,
      { attributes: { ...testTags, outcome } },
    );
  });
});

// ---------------------------------------------------------------------------
// emitRunDuration
// ---------------------------------------------------------------------------

describe('emitRunDuration', () => {
  it('calls Sentry.metrics.distribution with milliseconds', () => {
    emitRunDuration(120_000, testTags);
    expect(Sentry.metrics.distribution).toHaveBeenCalledWith(
      'auto_fix.run_duration_ms',
      120_000,
      { attributes: testTags, unit: 'millisecond' },
    );
  });
});

// ---------------------------------------------------------------------------
// emitMTTR
// ---------------------------------------------------------------------------

describe('emitMTTR', () => {
  it('calls Sentry.metrics.distribution with mttr in ms', () => {
    emitMTTR(1_800_000, testTags);
    expect(Sentry.metrics.distribution).toHaveBeenCalledWith(
      'auto_fix.mttr_ms',
      1_800_000,
      { attributes: testTags, unit: 'millisecond' },
    );
  });
});

// ---------------------------------------------------------------------------
// emitCostEstimate
// ---------------------------------------------------------------------------

describe('emitCostEstimate', () => {
  it('calls distribution for cost_per_fix_usd and gauge for monthly_spend_usd', () => {
    emitCostEstimate(1.50, testTags);
    expect(Sentry.metrics.distribution).toHaveBeenCalledWith(
      'auto_fix.cost_per_fix_usd',
      1.50,
      { attributes: testTags },
    );
    expect(Sentry.metrics.gauge).toHaveBeenCalledWith(
      'auto_fix.monthly_spend_usd',
      1.50,
      { attributes: testTags },
    );
  });
});

// ---------------------------------------------------------------------------
// emitPrAccepted / emitPrRejected
// ---------------------------------------------------------------------------

describe('emitPrAccepted', () => {
  it('calls count with pr_accepted metric name', () => {
    emitPrAccepted(testTags);
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      'auto_fix.pr_accepted',
      1,
      { attributes: testTags },
    );
  });
});

describe('emitPrRejected', () => {
  it('calls count with pr_rejected metric name', () => {
    emitPrRejected(testTags);
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      'auto_fix.pr_rejected',
      1,
      { attributes: testTags },
    );
  });
});

// ---------------------------------------------------------------------------
// Safety signal counters
// ---------------------------------------------------------------------------

describe('emitCircuitBreakerTrip', () => {
  it('calls count with safety.circuit_breaker_trip metric', () => {
    emitCircuitBreakerTrip(testTags);
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      'auto_fix.safety.circuit_breaker_trip',
      1,
      { attributes: testTags },
    );
  });
});

describe('emitScopeViolation', () => {
  it('calls count with safety.scope_violation metric', () => {
    emitScopeViolation(testTags);
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      'auto_fix.safety.scope_violation',
      1,
      { attributes: testTags },
    );
  });
});

describe('emitEscalation', () => {
  it('calls count with safety.escalation metric', () => {
    emitEscalation(testTags);
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      'auto_fix.safety.escalation',
      1,
      { attributes: testTags },
    );
  });
});
