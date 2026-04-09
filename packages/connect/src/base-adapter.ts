/**
 * Base adapter utilities — retry logic, error wrapping, and shared helpers
 * for all ConnectAdapter implementations.
 */

import { withRetry as coreRetry } from '@otaip/core';
import type { RetryConfig as CoreRetryConfig } from '@otaip/core';

export class ConnectError extends Error {
  constructor(
    message: string,
    public readonly supplier: string,
    public readonly operation: string,
    public readonly retryable: boolean = false,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ConnectError';
  }
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
};

export abstract class BaseAdapter {
  protected readonly retryConfig: RetryConfig;
  protected abstract readonly supplierId: string;

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  protected async withRetry<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const coreConfig: Partial<CoreRetryConfig> = {
      maxRetries: this.retryConfig.maxRetries,
      baseDelayMs: this.retryConfig.baseDelayMs,
      maxDelayMs: this.retryConfig.maxDelayMs,
    };

    try {
      return await coreRetry(fn, coreConfig, (error) => this.isRetryable(error));
    } catch (lastError) {
      if (lastError instanceof ConnectError) {
        throw lastError;
      }

      throw new ConnectError(
        `${operation} failed after ${this.retryConfig.maxRetries + 1} attempts`,
        this.supplierId,
        operation,
        false,
        lastError,
      );
    }
  }

  protected wrapError(operation: string, error: unknown, retryable: boolean = false): ConnectError {
    if (error instanceof ConnectError) return error;

    const message = error instanceof Error ? error.message : String(error);
    return new ConnectError(
      `${operation}: ${message}`,
      this.supplierId,
      operation,
      retryable,
      error,
    );
  }

  protected async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number = 30_000,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof ConnectError) return error.retryable;

    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('timeout') ||
        msg.includes('econnreset') ||
        msg.includes('econnrefused') ||
        msg.includes('network') ||
        msg.includes('fetch failed')
      );
    }

    return false;
  }
}
