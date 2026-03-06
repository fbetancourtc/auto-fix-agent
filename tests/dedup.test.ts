import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock set function before mocking the module
const mockSet = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    set = mockSet;
    constructor() {
      // intentionally empty
    }
  },
}));

import { isDuplicate, _resetRedisClient } from '../api/lib/dedup.js';

beforeEach(() => {
  vi.clearAllMocks();
  _resetRedisClient();
});

afterEach(() => {
  // Clean up env vars
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe('isDuplicate', () => {
  describe('when Redis env vars are configured', () => {
    beforeEach(() => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    });

    it('returns false for a new delivery ID (SET NX returns OK)', async () => {
      mockSet.mockResolvedValue('OK');
      const result = await isDuplicate('delivery-123');
      expect(result).toBe(false);
    });

    it('returns true for a duplicate delivery ID (SET NX returns null)', async () => {
      mockSet.mockResolvedValue(null);
      const result = await isDuplicate('delivery-123');
      expect(result).toBe(true);
    });

    it('uses correct Redis key format: dedup:{deliveryId}', async () => {
      mockSet.mockResolvedValue('OK');
      await isDuplicate('abc-def-ghi');
      expect(mockSet).toHaveBeenCalledWith(
        'dedup:abc-def-ghi',
        '1',
        { nx: true, ex: 86400 },
      );
    });

    it('sets 24-hour TTL (ex: 86400)', async () => {
      mockSet.mockResolvedValue('OK');
      await isDuplicate('test-id');
      const callArgs = mockSet.mock.calls[0];
      expect(callArgs[2]).toEqual({ nx: true, ex: 86400 });
    });

    it('returns false (fail-open) when Redis throws an error', async () => {
      mockSet.mockRejectedValue(new Error('Connection refused'));
      const result = await isDuplicate('delivery-456');
      expect(result).toBe(false);
    });
  });

  describe('when Redis env vars are not configured', () => {
    it('returns false when no env vars are set', async () => {
      const result = await isDuplicate('delivery-789');
      expect(result).toBe(false);
    });

    it('returns false when only URL is set', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
      const result = await isDuplicate('delivery-789');
      expect(result).toBe(false);
    });

    it('returns false when only token is set', async () => {
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
      const result = await isDuplicate('delivery-789');
      expect(result).toBe(false);
    });
  });
});
