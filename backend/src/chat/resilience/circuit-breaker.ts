export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export class CircuitOpenError extends Error {
  constructor(message = 'Circuit breaker is OPEN; falling back to human handoff') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Circuit Breaker + Retry Pattern (Tech Decisions Section 3 & PRD Section 8 NFRs):
 * Protects the RAG Chat pipeline against slow (>3s) or unavailable AI API calls.
 * When the circuit trips or times out, ChatService automatically falls back to a human handoff.
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private consecutiveFailures = 0;
  private lastFailureTime = 0;

  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.timeoutMs = options.timeoutMs ?? 2_800; // Under 3-second NFR target
    this.maxRetries = options.maxRetries ?? 1;
  }

  getState(): CircuitState {
    if (
      this.state === CircuitState.OPEN &&
      Date.now() - this.lastFailureTime >= this.cooldownMs
    ) {
      this.state = CircuitState.HALF_OPEN;
    }
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.lastFailureTime = 0;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const currentState = this.getState();
    if (currentState === CircuitState.OPEN) {
      throw new CircuitOpenError();
    }

    let lastError: unknown;
    const totalAttempts = this.maxRetries + 1;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      try {
        const result = await this.runWithTimeout(operation, this.timeoutMs);
        this.onSuccess();
        return result;
      } catch (err) {
        lastError = err;
        if (attempt === totalAttempts) {
          this.onFailure();
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Operation failed in CircuitBreaker');
  }

  private async runWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`AI provider timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }
}
