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
  readFileSync: vi.fn(() => JSON.stringify({ repos: {} })),
}));

// Mock handlers — use vi.hoisted to avoid hoisting issues
const { mockHandleWorkflowRun, mockHandlePullRequest, mockHandleReview } = vi.hoisted(() => ({
  mockHandleWorkflowRun: vi.fn(),
  mockHandlePullRequest: vi.fn(),
  mockHandleReview: vi.fn(),
}));

vi.mock('../api/lib/handlers/workflow-run.js', () => ({
  handleWorkflowRun: mockHandleWorkflowRun,
}));
vi.mock('../api/lib/handlers/pull-request.js', () => ({
  handlePullRequest: mockHandlePullRequest,
}));
vi.mock('../api/lib/handlers/review.js', () => ({
  handleReview: mockHandleReview,
}));

import { routeEvent } from '../api/lib/router.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('routeEvent', () => {
  describe('workflow_run events', () => {
    it('routes workflow_run.completed to handleWorkflowRun', async () => {
      const payload = {
        action: 'completed',
        workflow_run: { id: 1, conclusion: 'success', run_started_at: '2026-03-10T00:00:00Z', updated_at: '2026-03-10T00:05:00Z' },
        repository: { full_name: 'fbetancourtc/test-repo' },
      } as any;

      const result = await routeEvent('workflow_run', payload);
      expect(mockHandleWorkflowRun).toHaveBeenCalledWith(payload);
      expect(result.processed).toBe(true);
      expect(result.eventType).toBe('workflow_run');
    });

    it('skips workflow_run with non-completed action', async () => {
      const payload = {
        action: 'requested',
        workflow_run: { id: 1 },
        repository: { full_name: 'fbetancourtc/test-repo' },
      } as any;

      const result = await routeEvent('workflow_run', payload);
      expect(mockHandleWorkflowRun).not.toHaveBeenCalled();
      expect(result.processed).toBe(false);
      expect(result.reason).toBe('action not completed');
    });
  });

  describe('pull_request events', () => {
    it('routes auto-fix labeled PR to handlePullRequest', async () => {
      const payload = {
        action: 'closed',
        pull_request: {
          number: 42,
          labels: [{ name: 'auto-fix' }],
          merged: true,
        },
        repository: { full_name: 'fbetancourtc/test-repo' },
      } as any;

      const result = await routeEvent('pull_request', payload);
      expect(mockHandlePullRequest).toHaveBeenCalledWith(payload);
      expect(result.processed).toBe(true);
    });

    it('skips PR without auto-fix label', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 42,
          labels: [{ name: 'bug' }],
        },
        repository: { full_name: 'fbetancourtc/test-repo' },
      } as any;

      const result = await routeEvent('pull_request', payload);
      expect(mockHandlePullRequest).not.toHaveBeenCalled();
      expect(result.processed).toBe(false);
      expect(result.reason).toBe('no auto-fix label');
    });
  });

  describe('pull_request_review events', () => {
    it('routes review on auto-fix PR to handleReview', async () => {
      const payload = {
        action: 'submitted',
        review: { state: 'changes_requested' },
        pull_request: {
          number: 42,
          labels: [{ name: 'auto-fix' }],
        },
        repository: { full_name: 'fbetancourtc/test-repo' },
      } as any;

      const result = await routeEvent('pull_request_review', payload);
      expect(mockHandleReview).toHaveBeenCalledWith(payload);
      expect(result.processed).toBe(true);
    });

    it('skips review on non-auto-fix PR', async () => {
      const payload = {
        action: 'submitted',
        review: { state: 'approved' },
        pull_request: {
          number: 42,
          labels: [{ name: 'enhancement' }],
        },
        repository: { full_name: 'fbetancourtc/test-repo' },
      } as any;

      const result = await routeEvent('pull_request_review', payload);
      expect(mockHandleReview).not.toHaveBeenCalled();
      expect(result.processed).toBe(false);
      expect(result.reason).toBe('not auto-fix PR');
    });
  });

  describe('unrecognized events', () => {
    it('returns processed false for unknown event types', async () => {
      const payload = { action: 'completed' } as any;
      const result = await routeEvent('push', payload);
      expect(result.processed).toBe(false);
      expect(result.reason).toBe('unrecognized event type');
    });
  });
});
