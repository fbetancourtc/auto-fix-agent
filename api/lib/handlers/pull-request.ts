/**
 * Handler for pull_request events on auto-fix labeled PRs.
 *
 * Called by the router when a pull_request event passes the auto-fix label filter.
 * Emits value metrics: PR accepted (merged) or PR rejected (closed without merge).
 * Also emits scope violation signal on closed-without-merge as a safety indicator.
 * All metrics tagged with repo/org/stack.
 */
import * as Sentry from '@sentry/node';
import type { PullRequestEvent } from '@octokit/webhooks-types';
import {
  buildMetricTags,
  emitPrAccepted,
  emitPrRejected,
  emitScopeViolation,
} from '../metrics.js';

/**
 * Process a pull_request event on an auto-fix labeled PR.
 *
 * @param payload - GitHub pull_request webhook payload (strongly typed)
 */
export async function handlePullRequest(payload: PullRequestEvent): Promise<void> {
  const { pull_request: pr, repository } = payload;
  const tags = buildMetricTags(repository.full_name);

  // VAL-02: PR acceptance/rejection on close events
  if (payload.action === 'closed') {
    if (pr.merged) {
      emitPrAccepted(tags);
    } else {
      // Closed without merge -- rejection signal
      emitPrRejected(tags);
      // SAFE-03: Closed-without-merge is a potential scope violation signal
      emitScopeViolation(tags);
    }
  }

  // Sentry breadcrumb (keep existing, enhanced with metrics context)
  Sentry.addBreadcrumb({
    category: 'handler',
    message: `pull_request.${payload.action} processed`,
    data: {
      repo: repository.full_name,
      prNumber: pr.number,
      merged: 'merged' in pr ? pr.merged : undefined,
    },
  });
}
