import { describe, it, expect, vi } from 'vitest';
import { RetryHelper, NetworkError, RateLimitError } from '../RetryHelper';

describe('RetryHelper', () => {
  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await RetryHelper.withRetry(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should not retry on non-retriable error', async () => {
      const error = new Error('Non-retriable error');
      const mockFn = vi.fn().mockRejectedValue(error);
      const mockShouldRetry = vi.fn().mockReturnValue(false);

      await expect(
        RetryHelper.withRetry(mockFn, {
          shouldRetry: mockShouldRetry,
        })
      ).rejects.toThrow('Non-retriable error');

      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should use default retry logic for known error types', async () => {
      const networkError = new NetworkError('Network failed');
      const rateLimitError = new RateLimitError(60);
      const serverError = { status: 500 } as any;
      const clientError = { status: 400 } as any;

      const defaultOptions = (RetryHelper as any).defaultOptions;

      expect(defaultOptions.shouldRetry(networkError)).toBe(true);
      expect(defaultOptions.shouldRetry(rateLimitError)).toBe(true);
      expect(defaultOptions.shouldRetry(serverError)).toBe(true);
      expect(defaultOptions.shouldRetry(clientError)).toBe(false);
    });
  });

  describe('NetworkError', () => {
    it('should create network error with correct properties', () => {
      const error = new NetworkError('Connection failed');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('NetworkError');
      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe('NETWORK_ERROR');
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with default retry time', () => {
      const error = new RateLimitError();

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('RateLimitError');
      expect(error.message).toBe('Rate limited. Retry after 60 seconds');
      expect(error.status).toBe(429);
      expect(error.retryAfter).toBe(60);
    });

    it('should create rate limit error with custom retry time', () => {
      const error = new RateLimitError(120);

      expect(error.message).toBe('Rate limited. Retry after 120 seconds');
      expect(error.retryAfter).toBe(120);
    });
  });
});
