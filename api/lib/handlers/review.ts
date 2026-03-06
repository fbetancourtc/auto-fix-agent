/**
 * Handler for pull_request_review events on auto-fix PRs.
 *
 * Called by the router when a pull_request_review event passes the auto-fix label filter.
 * Emits escalation safety signal when a human requests changes on an auto-fix PR.
 * All metrics tagged with repo/org/stack.
 */
import * as Sentry from '@sentry/node';
import type { PullRequestReviewEvent } from '@octokit/webhooks-types';
import { buildMetricTags, emitEscalation } from '../metrics.js';

/**
 * Process a pull_request_review event on an auto-fix PR.
 *
 * @param payload - GitHub pull_request_review webhook payload (strongly typed)
 */
export async function handleReview(payload: PullRequestReviewEvent): Promise<void> {
  const { review, pull_request: pr, repository } = payload;
  const tags = buildMetricTags(repository.full_name);

  // SAFE-04: A human requesting changes on an auto-fix PR is an escalation signal
  if (review.state === 'changes_requested') {
    emitEscalation(tags);
  }

  // Sentry breadcrumb (keep existing, enhanced with metrics context)
  Sentry.addBreadcrumb({
    category: 'handler',
    message: `pull_request_review.${payload.action} processed`,
    data: {
      repo: repository.full_name,
      prNumber: pr.number,
      state: review.state,
    },
  });
}
