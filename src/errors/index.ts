export class MCBuyerError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = 'MCBuyerError';
  }
}

export class InsufficientBalanceError extends MCBuyerError {
  constructor(required: string, available: string) {
    super(
      `Insufficient balance: required ${required} USDC, available ${available} USDC`,
      'INSUFFICIENT_BALANCE',
      402,
    );
  }
}

export class ExpiredQuoteError extends MCBuyerError {
  constructor(quoteId: string) {
    super(`Quote ${quoteId} has expired`, 'EXPIRED_QUOTE', 410);
  }
}

export class UnauthorizedAgentError extends MCBuyerError {
  constructor(agentId: string) {
    super(`Agent ${agentId} is not authorized`, 'UNAUTHORIZED_AGENT', 403);
  }
}

export class SpendingLimitExceededError extends MCBuyerError {
  constructor(limitType: string, limit: string) {
    super(
      `Spending limit exceeded: ${limitType} limit is ${limit} USDC`,
      'SPENDING_LIMIT_EXCEEDED',
      402,
    );
  }
}

export class DuplicateRequestError extends MCBuyerError {
  constructor(reference: string) {
    super(`Duplicate request: ${reference}`, 'DUPLICATE_REQUEST', 409);
  }
}

export class QuoteMismatchError extends MCBuyerError {
  constructor() {
    super('Asset amount does not match quote', 'QUOTE_MISMATCH', 400);
  }
}

export class ServiceExecutionError extends MCBuyerError {
  constructor(provider: string, detail: string) {
    super(
      `Service execution failed at ${provider}: ${detail}`,
      'SERVICE_EXECUTION_FAILED',
      502,
    );
  }
}

export class ProviderError extends MCBuyerError {
  constructor(provider: string, detail: string) {
    super(`Provider ${provider} error: ${detail}`, 'PROVIDER_ERROR', 502);
  }
}

export class InvalidInputError extends MCBuyerError {
  constructor(detail: string) {
    super(`Invalid input: ${detail}`, 'INVALID_INPUT', 400);
  }
}
