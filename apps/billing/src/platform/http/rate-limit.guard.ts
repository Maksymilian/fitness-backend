import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import { type Counter, metrics, SpanStatusCode, trace } from '@opentelemetry/api';

/**
 * The rate limit (docs/architecture.md, section 16): @nestjs/throttler's guard, which answers 429
 * past RATE_LIMIT_PER_MINUTE requests from one caller, and also counts every request it rejects as
 * `rate_limit.rejected_requests` (in Prometheus, `rate_limit_rejected_requests_total`), by handler,
 * and marks it in its trace: a `rate_limit.rejected` event and the error status.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  // Created with the guard, after the OpenTelemetry SDK started (instrumentation.ts).
  private readonly rejected: Counter = metrics.getMeter('billing.rate-limit').createCounter('rate_limit.rejected_requests', {
    unit: '{request}',
    description: 'Requests rejected by the rate limit',
  });

  protected override async throwThrottlingException(context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    const handler = `${context.getClass().name}.${context.getHandler().name}`;
    this.rejected.add(1, { 'nestjs.handler': handler });
    // The span the guard runs in (the handler's, or the GraphQL field's) shows why the request stopped.
    trace
      .getActiveSpan()
      ?.addEvent('rate_limit.rejected', {
        'nestjs.handler': handler,
        'rate_limit.limit': detail.limit,
        'rate_limit.window_seconds': detail.ttl / 1000,
        'rate_limit.retry_after_seconds': detail.timeToBlockExpire,
      })
      .setStatus({ code: SpanStatusCode.ERROR, message: 'Too many requests' });
    return super.throwThrottlingException(context, detail);
  }
}
