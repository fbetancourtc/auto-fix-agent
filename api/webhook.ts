/**
 * Vercel serverless function entry point for GitHub webhook events.
 *
 * Flow: env gate -> method gate -> raw body -> signature verify -> respond 200 -> waitUntil(processEvent)
 *
 * Uses the Web API handler format (export default { fetch }) per Vercel's current recommendation.
 */

// Import Sentry init first -- ensures Sentry.init() runs at module scope before anything else
import './lib/sentry.js';

import * as Sentry from '@sentry/node';
import { waitUntil } from '@vercel/functions';
import { verifyWebhookSignature } from './lib/verify.js';
import { extractHeaders, type WebhookHeaders } from './lib/types.js';
import { flushSentry } from './lib/sentry.js';
import { routeEvent } from './lib/router.js';

export default {
  async fetch(request: Request): Promise<Response> {
    // 1. Environment gate: return 404 for non-production (reveals nothing about endpoint)
    if (process.env.VERCEL_ENV !== 'production') {
      return new Response('', { status: 404 });
    }

    // 2. Method gate: only accept POST
    if (request.method !== 'POST') {
      return new Response('', { status: 405 });
    }

    // 3. Read raw body BEFORE any other body access (prevents stream consumption)
    const rawBody = await request.text();

    // 4. Extract GitHub webhook headers
    const headers = extractHeaders(request.headers);

    // 5. Verify HMAC-SHA256 signature
    const secret = process.env.GITHUB_WEBHOOK_SECRET ?? '';
    const isValid = await verifyWebhookSignature(rawBody, headers.signature, secret);

    if (!isValid) {
      return new Response('', { status: 401 });
    }

    // 6. Respond 200 immediately (response-first pattern)
    const response = new Response('OK', { status: 200 });

    // 7. Defer all processing after response
    waitUntil(processEvent(rawBody, headers));

    return response;
  },
};

/**
 * Process a verified webhook event inside waitUntil().
 *
 * This function runs AFTER the 200 response has been sent to GitHub.
 * Sentry breadcrumbs and error capture happen here, not in the request path.
 */
async function processEvent(
  rawBody: string,
  headers: WebhookHeaders,
): Promise<void> {
  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const action = (payload.action as string) ?? 'unknown';
    const repository = payload.repository as Record<string, unknown> | undefined;

    Sentry.addBreadcrumb({
      category: 'webhook',
      message: `${headers.eventType}.${action}`,
      data: {
        deliveryId: headers.deliveryId,
        repository: repository?.full_name as string | undefined,
      },
    });

    await routeEvent(headers.eventType, payload);
  } catch (error) {
    Sentry.captureException(error);
  } finally {
    await flushSentry(2000);
  }
}
