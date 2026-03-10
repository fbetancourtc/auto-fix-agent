import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to avoid hoisting issues with vi.mock factories
const { mockVerify } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
}));

vi.mock('@octokit/webhooks-methods', () => ({
  verify: mockVerify,
}));

import { verifyWebhookSignature } from '../api/lib/verify.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('verifyWebhookSignature', () => {
  it('returns true when signature is valid', async () => {
    mockVerify.mockResolvedValue(true);
    const result = await verifyWebhookSignature('body', 'sha256=abc', 'secret');
    expect(result).toBe(true);
    expect(mockVerify).toHaveBeenCalledWith('secret', 'body', 'sha256=abc');
  });

  it('returns false when signature is invalid', async () => {
    mockVerify.mockResolvedValue(false);
    const result = await verifyWebhookSignature('body', 'sha256=bad', 'secret');
    expect(result).toBe(false);
  });

  it('returns false when signature is empty', async () => {
    const result = await verifyWebhookSignature('body', '', 'secret');
    expect(result).toBe(false);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('returns false when secret is empty', async () => {
    const result = await verifyWebhookSignature('body', 'sha256=abc', '');
    expect(result).toBe(false);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('returns false when both signature and secret are empty', async () => {
    const result = await verifyWebhookSignature('body', '', '');
    expect(result).toBe(false);
    expect(mockVerify).not.toHaveBeenCalled();
  });
});
