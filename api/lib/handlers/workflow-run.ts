/**
 * Handler stub for workflow_run.completed events.
 *
 * Called by the router when a workflow_run event with action === 'completed' is received.
 */
import * as Sentry from '@sentry/node';

/**
 * Process a workflow_run.completed event.
 *
 * @param payload - GitHub workflow_run webhook payload
 */
export async function handleWorkflowRun(payload: any): Promise<void> {
  Sentry.addBreadcrumb({
    category: 'handler',
    message: 'workflow_run.completed processed',
    data: {
      repo: payload.repository?.full_name,
      runId: payload.workflow_run?.id,
      conclusion: payload.workflow_run?.conclusion,
    },
  });

  // Phase 6 will emit Sentry metrics here (trigger count, outcome, duration)
}
