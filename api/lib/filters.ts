/**
 * Event filtering functions for GitHub webhook payloads.
 *
 * These filters gate handler dispatch in the router -- only events matching
 * the auto-fix workflow proceed to processing.
 *
 * Uses @octokit/webhooks-types for strong typing (upgraded from `any` in Phase 6).
 */
import type { PullRequestEvent, PullRequestReviewEvent } from '@octokit/webhooks-types';

/** The label name used across v1.0/v1.1 to identify auto-fix PRs. */
const AUTO_FIX_LABEL = 'auto-fix';

/**
 * Check whether a pull_request event payload has the auto-fix label.
 *
 * @param payload - GitHub pull_request webhook payload
 * @returns true if the PR's labels array contains a label with name === 'auto-fix'
 */
export function isAutoFixLabeledPR(payload: PullRequestEvent): boolean {
  const labels = payload.pull_request?.labels;
  if (!labels || labels.length === 0) {
    return false;
  }
  return labels.some((label) => label.name === AUTO_FIX_LABEL);
}

/**
 * Check whether a pull_request_review event is on an auto-fix labeled PR.
 *
 * Reviews on auto-fix PRs have the PR labels available in payload.pull_request.labels.
 *
 * @param payload - GitHub pull_request_review webhook payload
 * @returns true if the reviewed PR has the auto-fix label
 */
export function isReviewOnAutoFixPR(payload: PullRequestReviewEvent): boolean {
  const labels = payload.pull_request?.labels;
  if (!labels || labels.length === 0) {
    return false;
  }
  return labels.some((label) => label.name === AUTO_FIX_LABEL);
}
