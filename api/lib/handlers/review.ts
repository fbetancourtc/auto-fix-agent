/**
 * Handler stub for pull_request_review events on auto-fix PRs.
 *
 * Called by the router when a pull_request_review event passes the auto-fix label filter.
 */
import * as Sentry from '@sentry/node';

/**
 * Process a pull_request_review event on an auto-fix PR.
 *
 * @param payload - GitHub pull_request_review webhook payload
 */
export async function handleReview(payload: any): Promise<void> {
  Sentry.addBreadcrumb({
    category: 'handler',
    message: `pull_request_review.${payload.action} processed`,
    data: {
      repo: payload.repository?.full_name,
      prNumber: payload.pull_request?.number,
      state: payload.review?.state,
    },
  });

  // Phase 6 will process review outcomes here
}
