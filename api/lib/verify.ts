/**
 * HMAC-SHA256 signature verification wrapper.
 *
 * This is the ONLY place signature verification logic lives -- single responsibility.
 * Delegates to @octokit/webhooks-methods for timing-safe comparison.
 */
import { verify } from '@octokit/webhooks-methods';

/**
 * Verify a GitHub webhook HMAC-SHA256 signature against the raw request body.
 *
 * @param rawBody  - The raw request body as a string (from request.text())
 * @param signature - The value of the X-Hub-Signature-256 header
 * @param secret    - The webhook secret (from GITHUB_WEBHOOK_SECRET env var)
 * @returns true if the signature is valid, false otherwise
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) {
    return false;
  }
  return verify(secret, rawBody, signature);
}
