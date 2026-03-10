import { describe, it, expect } from 'vitest';
import { isAutoFixLabeledPR, isReviewOnAutoFixPR } from '../api/lib/filters.js';

describe('isAutoFixLabeledPR', () => {
  it('returns true when PR has auto-fix label', () => {
    const payload = {
      pull_request: {
        labels: [{ name: 'auto-fix' }, { name: 'bug' }],
      },
    };
    expect(isAutoFixLabeledPR(payload)).toBe(true);
  });

  it('returns false when PR has no auto-fix label', () => {
    const payload = {
      pull_request: {
        labels: [{ name: 'bug' }, { name: 'enhancement' }],
      },
    };
    expect(isAutoFixLabeledPR(payload)).toBe(false);
  });

  it('returns false when PR has empty labels array', () => {
    const payload = {
      pull_request: {
        labels: [],
      },
    };
    expect(isAutoFixLabeledPR(payload)).toBe(false);
  });

  it('returns false when PR has no labels property', () => {
    const payload = {
      pull_request: {},
    };
    expect(isAutoFixLabeledPR(payload)).toBe(false);
  });

  it('returns false when payload has no pull_request', () => {
    const payload = {};
    expect(isAutoFixLabeledPR(payload)).toBe(false);
  });

  it('returns true when auto-fix is the only label', () => {
    const payload = {
      pull_request: {
        labels: [{ name: 'auto-fix' }],
      },
    };
    expect(isAutoFixLabeledPR(payload)).toBe(true);
  });
});

describe('isReviewOnAutoFixPR', () => {
  it('returns true when reviewed PR has auto-fix label', () => {
    const payload = {
      pull_request: {
        labels: [{ name: 'auto-fix' }],
      },
    };
    expect(isReviewOnAutoFixPR(payload)).toBe(true);
  });

  it('returns false when reviewed PR lacks auto-fix label', () => {
    const payload = {
      pull_request: {
        labels: [{ name: 'needs-review' }],
      },
    };
    expect(isReviewOnAutoFixPR(payload)).toBe(false);
  });

  it('returns false when reviewed PR has no labels', () => {
    const payload = {
      pull_request: {
        labels: [],
      },
    };
    expect(isReviewOnAutoFixPR(payload)).toBe(false);
  });
});
