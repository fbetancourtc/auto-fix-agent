/**
 * Event type router for GitHub webhook events.
 *
 * Dispatches verified webhook payloads to the appropriate handler based on
 * the X-GitHub-Event header value. Applies event-level filtering (action type,
 * label presence) before handler dispatch.
 *
 * Unrecognized event types are logged as Sentry breadcrumbs and skipped --
 * they never produce errors (prevents Sentry quota waste).
 */
import * as Sentry from '@sentry/node';
import type {
  WorkflowRunEvent,
  PullRequestEvent,
  PullRequestReviewEvent,
} from '@octokit/webhooks-types';
import type { ProcessEventResult } from './types.js';
import { isAutoFixLabeledPR, isReviewOnAutoFixPR } from './filters.js';
import { handleWorkflowRun } from './handlers/workflow-run.js';
import { handlePullRequest } from './handlers/pull-request.js';
import { handleReview } from './handlers/review.js';

/** Union of all webhook payload types this router handles. */
export type WebhookPayload = WorkflowRunEvent | PullRequestEvent | PullRequestReviewEvent;

/**
 * Route a webhook event to the appropriate handler.
 *
 * @param eventType - The value of the X-GitHub-Event header
 * @param payload   - The parsed JSON webhook payload
 * @returns ProcessEventResult indicating whether the event was processed
 */
export async function routeEvent(
  eventType: string,
  payload: WebhookPayload,
): Promise<ProcessEventResult> {
  const action = (payload.action as string) ?? 'unknown';

  switch (eventType) {
    case 'workflow_run': {
      const wfPayload = payload as WorkflowRunEvent;
      if (wfPayload.action !== 'completed') {
        Sentry.addBreadcrumb({
          category: 'webhook.filter',
          message: `Skipped workflow_run.${wfPayload.action}`,
        });
        return { eventType, action, processed: false, reason: 'action not completed' };
      }
      await handleWorkflowRun(wfPayload);
      return { eventType, action, processed: true };
    }

    case 'pull_request': {
      const prPayload = payload as PullRequestEvent;
      if (!isAutoFixLabeledPR(prPayload)) {
        Sentry.addBreadcrumb({
          category: 'webhook.filter',
          message: 'Skipped PR without auto-fix label',
        });
        return { eventType, action, processed: false, reason: 'no auto-fix label' };
      }
      await handlePullRequest(prPayload);
      return { eventType, action, processed: true };
    }

    case 'pull_request_review': {
      const reviewPayload = payload as PullRequestReviewEvent;
      if (!isReviewOnAutoFixPR(reviewPayload)) {
        Sentry.addBreadcrumb({
          category: 'webhook.filter',
          message: 'Skipped review on non-auto-fix PR',
        });
        return { eventType, action, processed: false, reason: 'not auto-fix PR' };
      }
      await handleReview(reviewPayload);
      return { eventType, action, processed: true };
    }

    default: {
      Sentry.addBreadcrumb({
        category: 'webhook.filter',
        message: `Unrecognized event: ${eventType}`,
      });
      return { eventType, action, processed: false, reason: 'unrecognized event type' };
    }
  }
}
