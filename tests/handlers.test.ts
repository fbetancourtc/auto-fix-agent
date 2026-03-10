import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Sentry
vi.mock('@sentry/node', () => ({
  addBreadcrumb: vi.fn(),
  metrics: {
    count: vi.fn(),
    distribution: vi.fn(),
    gauge: vi.fn(),
  },
}));

// Mock fs for metrics module (repo-stack-map.json)
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() =>
    JSON.stringify({
      repos: {
        'fbetancourtc/test-repo': { stack: 'typescript' },
      },
    }),
  ),
}));

import * as Sentry from '@sentry/node';
import { handleWorkflowRun } from '../api/lib/handlers/workflow-run.js';
import { handlePullRequest } from '../api/lib/handlers/pull-request.js';
import { handleReview } from '../api/lib/handlers/review.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// handleWorkflowRun
// ---------------------------------------------------------------------------

describe('handleWorkflowRun', () => {
  const basePayload = {
    action: 'completed',
    workflow_run: {
      id: 12345,
      conclusion: 'success',
      run_started_at: '2026-03-10T10:00:00Z',
      updated_at: '2026-03-10T10:05:00Z',
    },
    repository: { full_name: 'fbetancourtc/test-repo' },
  } as any;

  it('emits trigger count metric', async () => {
    await handleWorkflowRun(basePayload);
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      'auto_fix.trigger_count',
      1,
      expect.objectContaining({ attributes: expect.objectContaining({ repo: 'fbetancourtc/test-repo' }) }),
    );
  });

  it('emits run duration metric for positive duration', async () => {
    await handleWorkflowRun(basePayload);
    // 5 minutes = 300000ms
    expect(Sentry.metrics.distribution).toHaveBeenCalledWith(
      'auto_fix.run_duration_ms',
      300000,
      expect.objectContaining({ unit: 'millisecond' }),
    );
  });

  it('emits outcome metric with fix_pr_created for success conclusion', async () => {
    await handleWorkflowRun(basePayload);
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      'auto_fix.outcome',
      1,
      expect.objectContaining({ attributes: expect.objectContaining({ outcome: 'fix_pr_created' }) }),
    );
  });

  it('emits outcome no_fix for failure conclusion', async () => {
    const payload = {
      ...basePayload,
      workflow_run: { ...basePayload.workflow_run, conclusion: 'failure' },
    };
    await handleWorkflowRun(payload);
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      'auto_fix.outcome',
      1,
      expect.objectContaining({ attributes: expect.objectContaining({ outcome: 'no_fix' }) }),
    );
  });

  it('emits outcome escalated for cancelled conclusion', async () => {
    const payload = {
      ...basePayload,
      workflow_run: { ...basePayload.workflow_run, conclusion: 'cancelled' },
    };
    await handleWorkflowRun(payload);
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      'auto_fix.outcome',
      1,
      expect.objectContaining({ attributes: expect.objectContaining({ outcome: 'escalated' }) }),
    );
  });

  it('emits MTTR metric on successful fix', async () => {
    await handleWorkflowRun(basePayload);
    expect(Sentry.metrics.distribution).toHaveBeenCalledWith(
      'auto_fix.mttr_ms',
      300000,
      expect.objectContaining({ unit: 'millisecond' }),
    );
  });

  it('does not emit MTTR on failure', async () => {
    const payload = {
      ...basePayload,
      workflow_run: { ...basePayload.workflow_run, conclusion: 'failure' },
    };
    await handleWorkflowRun(payload);
    const mttrCalls = (Sentry.metrics.distribution as any).mock.calls.filter(
      (c: any) => c[0] === 'auto_fix.mttr_ms',
    );
    expect(mttrCalls).toHaveLength(0);
  });

  it('emits cost estimate metric', async () => {
    await handleWorkflowRun(basePayload);
    expect(Sentry.metrics.distribution).toHaveBeenCalledWith(
      'auto_fix.cost_per_fix_usd',
      expect.any(Number),
      expect.any(Object),
    );
    expect(Sentry.metrics.gauge).toHaveBeenCalledWith(
      'auto_fix.monthly_spend_usd',
      expect.any(Number),
      expect.any(Object),
    );
  });

  it('adds Sentry breadcrumb with handler context', async () => {
    await handleWorkflowRun(basePayload);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'handler',
        message: 'workflow_run.completed processed',
        data: expect.objectContaining({
          repo: 'fbetancourtc/test-repo',
          runId: 12345,
          outcome: 'fix_pr_created',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// handlePullRequest
// ---------------------------------------------------------------------------

describe('handlePullRequest', () => {
  it('emits pr_accepted when PR is merged', async () => {
    const payload = {
      action: 'closed',
      pull_request: {
        number: 42,
        labels: [{ name: 'auto-fix' }],
        merged: true,
      },
      repository: { full_name: 'fbetancourtc/test-repo' },
    } as any;

    await handlePullRequest(payload);
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      'auto_fix.pr_accepted',
      1,
      expect.any(Object),
    );
  });

  it('emits pr_rejected and scope_violation when PR is closed without merge', async () => {
    const payload = {
      action: 'closed',
      pull_request: {
        number: 42,
        labels: [{ name: 'auto-fix' }],
        merged: false,
      },
      repository: { full_name: 'fbetancourtc/test-repo' },
    } as any;

    await handlePullRequest(payload);
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      'auto_fix.pr_rejected',
      1,
      expect.any(Object),
    );
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      'auto_fix.safety.scope_violation',
      1,
      expect.any(Object),
    );
  });

  it('does not emit acceptance metrics for non-close actions', async () => {
    const payload = {
      action: 'opened',
      pull_request: {
        number: 42,
        labels: [{ name: 'auto-fix' }],
      },
      repository: { full_name: 'fbetancourtc/test-repo' },
    } as any;

    await handlePullRequest(payload);
    expect(Sentry.metrics.count).not.toHaveBeenCalled();
  });

  it('adds Sentry breadcrumb with PR context', async () => {
    const payload = {
      action: 'opened',
      pull_request: {
        number: 42,
        labels: [{ name: 'auto-fix' }],
      },
      repository: { full_name: 'fbetancourtc/test-repo' },
    } as any;

    await handlePullRequest(payload);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'handler',
        message: 'pull_request.opened processed',
        data: expect.objectContaining({
          prNumber: 42,
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// handleReview
// ---------------------------------------------------------------------------

describe('handleReview', () => {
  it('emits escalation signal when review requests changes', async () => {
    const payload = {
      action: 'submitted',
      review: { state: 'changes_requested' },
      pull_request: {
        number: 42,
        labels: [{ name: 'auto-fix' }],
      },
      repository: { full_name: 'fbetancourtc/test-repo' },
    } as any;

    await handleReview(payload);
    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      'auto_fix.safety.escalation',
      1,
      expect.any(Object),
    );
  });

  it('does not emit escalation for approved reviews', async () => {
    const payload = {
      action: 'submitted',
      review: { state: 'approved' },
      pull_request: {
        number: 42,
        labels: [{ name: 'auto-fix' }],
      },
      repository: { full_name: 'fbetancourtc/test-repo' },
    } as any;

    await handleReview(payload);
    expect(Sentry.metrics.count).not.toHaveBeenCalled();
  });

  it('does not emit escalation for commented reviews', async () => {
    const payload = {
      action: 'submitted',
      review: { state: 'commented' },
      pull_request: {
        number: 42,
        labels: [{ name: 'auto-fix' }],
      },
      repository: { full_name: 'fbetancourtc/test-repo' },
    } as any;

    await handleReview(payload);
    expect(Sentry.metrics.count).not.toHaveBeenCalled();
  });

  it('adds Sentry breadcrumb with review context', async () => {
    const payload = {
      action: 'submitted',
      review: { state: 'approved' },
      pull_request: {
        number: 42,
        labels: [{ name: 'auto-fix' }],
      },
      repository: { full_name: 'fbetancourtc/test-repo' },
    } as any;

    await handleReview(payload);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'handler',
        message: 'pull_request_review.submitted processed',
        data: expect.objectContaining({
          prNumber: 42,
          state: 'approved',
        }),
      }),
    );
  });
});
