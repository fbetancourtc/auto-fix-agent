/**
 * Shared TypeScript types for webhook payloads and handler signatures.
 */

/** GitHub webhook event types this receiver processes. */
export type WebhookEventType =
  | 'workflow_run'
  | 'pull_request'
  | 'pull_request_review';

/** Result of processing a single webhook event. */
export interface ProcessEventResult {
  eventType: string;
  action: string;
  processed: boolean;
  reason?: string;
}

/** Extracted GitHub webhook headers. */
export interface WebhookHeaders {
  eventType: string;
  deliveryId: string;
  signature: string;
}

/**
 * Extract GitHub webhook headers from a Request's Headers object.
 *
 * Reads:
 *  - x-github-event   -> eventType
 *  - x-github-delivery -> deliveryId
 *  - x-hub-signature-256 -> signature
 */
export function extractHeaders(headers: Headers): WebhookHeaders {
  return {
    eventType: headers.get('x-github-event') ?? '',
    deliveryId: headers.get('x-github-delivery') ?? '',
    signature: headers.get('x-hub-signature-256') ?? '',
  };
}
