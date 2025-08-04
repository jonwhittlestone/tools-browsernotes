export interface RetryOptions {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    shouldRetry?: (error: any) => boolean;
}

export class RetryHelper {
    private static defaultOptions: RetryOptions = {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        shouldRetry: (error) => {
            if (error.status === 429) return true;
            if (error.status >= 500) return true;
            if (error.code === 'NETWORK_ERROR') return true;
            return false;
        }
    };
    
    static async withRetry<T>(
        fn: () => Promise<T>,
        options: RetryOptions = {}
    ): Promise<T> {
        const opts = { ...this.defaultOptions, ...options };
        let lastError: any;
        let delay = opts.initialDelay!;
        
        for (let attempt = 0; attempt <= opts.maxRetries!; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (attempt === opts.maxRetries || !opts.shouldRetry!(error)) {
                    throw error;
                }
                
                await this.sleep(delay);
                delay = Math.min(delay * opts.backoffMultiplier!, opts.maxDelay!);
            }
        }
        
        throw lastError;
    }
    
    private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export class NetworkError extends Error {
    code = 'NETWORK_ERROR';
    
    constructor(message: string) {
        super(message);
        this.name = 'NetworkError';
    }
}

export class RateLimitError extends Error {
    status = 429;
    retryAfter: number;
    
    constructor(retryAfter: number = 60) {
        super(`Rate limited. Retry after ${retryAfter} seconds`);
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
    }
}