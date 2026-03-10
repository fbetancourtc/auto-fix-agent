import { describe, it, expect } from 'vitest';
import { extractHeaders } from '../api/lib/types.js';

describe('extractHeaders', () => {
  it('extracts all three GitHub webhook headers', () => {
    const headers = new Headers({
      'x-github-event': 'workflow_run',
      'x-github-delivery': 'abc-123',
      'x-hub-signature-256': 'sha256=deadbeef',
    });
    const result = extractHeaders(headers);
    expect(result).toEqual({
      eventType: 'workflow_run',
      deliveryId: 'abc-123',
      signature: 'sha256=deadbeef',
    });
  });

  it('returns empty strings for missing headers', () => {
    const headers = new Headers();
    const result = extractHeaders(headers);
    expect(result).toEqual({
      eventType: '',
      deliveryId: '',
      signature: '',
    });
  });

  it('handles partial headers', () => {
    const headers = new Headers({
      'x-github-event': 'pull_request',
    });
    const result = extractHeaders(headers);
    expect(result.eventType).toBe('pull_request');
    expect(result.deliveryId).toBe('');
    expect(result.signature).toBe('');
  });
});
