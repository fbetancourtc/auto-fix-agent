import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @sentry/node before importing monitors module
vi.mock('@sentry/node', () => ({
  captureCheckIn: vi.fn(),
}));

import * as Sentry from '@sentry/node';
import { repoSlug, emitRepoHeartbeat } from '../api/lib/monitors.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// repoSlug
// ---------------------------------------------------------------------------

describe('repoSlug', () => {
  it('converts org/repo to lowercase with repo- prefix', () => {
    expect(repoSlug('Liftitapp/geocoding-enterprise')).toBe(
      'repo-liftitapp-geocoding-enterprise',
    );
  });

  it('handles personal repos', () => {
    expect(repoSlug('fbetancourtc/laundry-admin-dash')).toBe(
      'repo-fbetancourtc-laundry-admin-dash',
    );
  });

  it('lowercases org names with mixed case', () => {
    expect(repoSlug('LiftitFinOps/conciliacion-averias')).toBe(
      'repo-liftitfinops-conciliacion-averias',
    );
  });

  it('replaces dots with hyphens', () => {
    expect(repoSlug('org/repo.name')).toBe('repo-org-repo-name');
  });

  it('replaces underscores with hyphens', () => {
    expect(repoSlug('org/repo_name')).toBe('repo-org-repo-name');
  });

  it('collapses consecutive special characters into a single hyphen', () => {
    expect(repoSlug('org/repo..name__test')).toBe('repo-org-repo-name-test');
  });

  it('trims trailing hyphens', () => {
    expect(repoSlug('org/repo-')).toBe('repo-org-repo');
  });
});

// ---------------------------------------------------------------------------
// emitRepoHeartbeat
// ---------------------------------------------------------------------------

describe('emitRepoHeartbeat', () => {
  it('calls Sentry.captureCheckIn with correct slug and config', () => {
    emitRepoHeartbeat('Liftitapp/geocoding-enterprise');

    expect(Sentry.captureCheckIn).toHaveBeenCalledWith(
      {
        monitorSlug: 'repo-liftitapp-geocoding-enterprise',
        status: 'ok',
      },
      {
        schedule: { type: 'interval', value: 7, unit: 'day' },
        checkinMargin: 1440,
        maxRuntime: 1,
        timezone: 'UTC',
        failureIssueThreshold: 1,
        recoveryThreshold: 1,
      },
    );
  });

  it('calls captureCheckIn exactly once per invocation', () => {
    emitRepoHeartbeat('fbetancourtc/laundry-admin-dash');
    expect(Sentry.captureCheckIn).toHaveBeenCalledTimes(1);
  });

  it('uses the sanitized slug from repoSlug', () => {
    emitRepoHeartbeat('LiftitFinOps/conciliacion-averias');

    expect(Sentry.captureCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({
        monitorSlug: 'repo-liftitfinops-conciliacion-averias',
      }),
      expect.any(Object),
    );
  });
});
