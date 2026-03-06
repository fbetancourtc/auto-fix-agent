/**
 * Handler for workflow_run.completed events.
 *
 * Called by the router when a workflow_run event with action === 'completed' is received.
 * Emits operational metrics: trigger count, outcome classification, run duration,
 * MTTR (on success), and cost estimate. All metrics tagged with repo/org/stack.
 */
import * as Sentry from '@sentry/node';
import type { WorkflowRunEvent } from '@octokit/webhooks-types';
import type { FixOutcome } from '../types.js';
import {
  buildMetricTags,
  emitTriggerCount,
  emitOutcome,
  emitRunDuration,
  emitMTTR,
  emitCostEstimate,
  estimateCostUsd,
} from '../metrics.js';

/**
 * Classify workflow_run conclusion into a FixOutcome category.
 *
 * Heuristic mapping:
 *  - 'success'   -> 'fix_pr_created' (CI passed, fix was delivered)
 *  - 'failure'   -> 'no_fix' (CI failed, no fix produced)
 *  - 'cancelled' -> 'escalated' (run was cancelled, likely needs human attention)
 *  - other       -> 'no_fix' (neutral, timed_out, skipped, etc.)
 */
function classifyOutcome(conclusion: string | null): FixOutcome {
  switch (conclusion) {
    case 'success':
      return 'fix_pr_created';
    case 'failure':
      return 'no_fix';
    case 'cancelled':
      return 'escalated';
    default:
      return 'no_fix';
  }
}

/**
 * Process a workflow_run.completed event.
 *
 * @param payload - GitHub workflow_run webhook payload (strongly typed)
 */
export async function handleWorkflowRun(payload: WorkflowRunEvent): Promise<void> {
  const { workflow_run: run, repository } = payload;
  const tags = buildMetricTags(repository.full_name);

  // OPS-01: Trigger count
  emitTriggerCount(tags);

  // Compute run duration from timestamps
  const startedAt = new Date(run.run_started_at).getTime();
  const updatedAt = new Date(run.updated_at).getTime();
  const durationMs = updatedAt - startedAt;

  // OPS-04: Run duration
  if (durationMs > 0) {
    emitRunDuration(durationMs, tags);
  }

  // VAL-03, VAL-04, SAFE-01: Cost estimate
  if (durationMs > 0) {
    const cost = estimateCostUsd(durationMs);
    emitCostEstimate(cost, tags);
  }

  // OPS-02: Outcome classification
  const outcome = classifyOutcome(run.conclusion);
  emitOutcome(outcome, tags);

  // VAL-01: MTTR -- emitted only on successful fix (run duration as proxy)
  // The workflow_run payload has run_started_at (failure detection proxy) and
  // updated_at (fix completion time). This measures time-from-CI-start-to-fix-completion.
  if (outcome === 'fix_pr_created' && durationMs > 0) {
    emitMTTR(durationMs, tags);
  }

  // Sentry breadcrumb (enhanced with outcome classification)
  Sentry.addBreadcrumb({
    category: 'handler',
    message: 'workflow_run.completed processed',
    data: {
      repo: repository.full_name,
      runId: run.id,
      conclusion: run.conclusion,
      outcome,
      durationMs,
    },
  });
}
