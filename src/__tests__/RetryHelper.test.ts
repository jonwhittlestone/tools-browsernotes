import { RetryHelper, NetworkError, RateLimitError } from '../RetryHelper';

describe('RetryHelper', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await RetryHelper.withRetry(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retriable error and eventually succeed', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValue('success');

      const mockShouldRetry = jest.fn().mockReturnValue(true);

      const promise = RetryHelper.withRetry(mockFn, {
        maxRetries: 2,
        initialDelay: 100,
        shouldRetry: mockShouldRetry,
      });

      // Fast-forward through the delay
      jest.advanceTimersByTime(100);

      const result = await promise;

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockShouldRetry).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should fail after max retries', async () => {
      const error = new Error('Persistent error');
      const mockFn = jest.fn().mockRejectedValue(error);
      const mockShouldRetry = jest.fn().mockReturnValue(true);

      const promise = RetryHelper.withRetry(mockFn, {
        maxRetries: 2,
        initialDelay: 100,
        shouldRetry: mockShouldRetry,
      });

      // Fast-forward through all delays
      jest.advanceTimersByTime(300); // 100 + 200

      await expect(promise).rejects.toThrow('Persistent error');
      expect(mockFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry on non-retriable error', async () => {
      const error = new Error('Non-retriable error');
      const mockFn = jest.fn().mockRejectedValue(error);
      const mockShouldRetry = jest.fn().mockReturnValue(false);

      await expect(
        RetryHelper.withRetry(mockFn, {
          shouldRetry: mockShouldRetry,
        })
      ).rejects.toThrow('Non-retriable error');

      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      const error = new Error('Retriable error');
      const mockFn = jest.fn().mockRejectedValue(error);
      const mockShouldRetry = jest.fn().mockReturnValue(true);

      const promise = RetryHelper.withRetry(mockFn, {
        maxRetries: 2,
        initialDelay: 100,
        backoffMultiplier: 2,
        shouldRetry: mockShouldRetry,
      });

      // First retry delay: 100ms
      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(2);

      // Second retry delay: 200ms (100 * 2)
      jest.advanceTimersByTime(200);
      expect(mockFn).toHaveBeenCalledTimes(3);

      await expect(promise).rejects.toThrow('Retriable error');
    });

    it('should respect max delay', async () => {
      const error = new Error('Retriable error');
      const mockFn = jest.fn().mockRejectedValue(error);
      const mockShouldRetry = jest.fn().mockReturnValue(true);

      const promise = RetryHelper.withRetry(mockFn, {
        maxRetries: 3,
        initialDelay: 100,
        maxDelay: 150,
        backoffMultiplier: 3,
        shouldRetry: mockShouldRetry,
      });

      // First retry: 100ms
      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(2);

      // Second retry: should be 300ms but capped at 150ms
      jest.advanceTimersByTime(150);
      expect(mockFn).toHaveBeenCalledTimes(3);

      // Third retry: still capped at 150ms
      jest.advanceTimersByTime(150);
      expect(mockFn).toHaveBeenCalledTimes(4);

      await expect(promise).rejects.toThrow('Retriable error');
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