import { type ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext, type GqlContextType } from '@nestjs/graphql';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import { type Counter, metrics, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Request, Response } from 'express';

/**
 * The rate limit (docs/architecture.md, section 16): @nestjs/throttler's guard, past
 * RATE_LIMIT_PER_MINUTE requests from one caller: 429, with `TOO_MANY_REQUESTS` over GraphQL
 * (`RateLimitFilter`; checked on the root fields only: Nest doesn't run guards on field resolvers). RabbitMQ's messages
 * aren't requests, so they pass. Every rejected request is counted as `rate_limit.rejected_requests`
 * (in Prometheus, `rate_limit_rejected_requests_total`), by handler, and marked in its trace: a
 * `rate_limit.rejected` event and the error status.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  // Created with the guard, after the OpenTelemetry SDK started (instrumentation.ts).
  private readonly rejected: Counter = metrics.getMeter('training-progress.rate-limit').createCounter('rate_limit.rejected_requests', {
    unit: '{request}',
    description: 'Requests rejected by the rate limit',
  });

  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const type = context.getType<GqlContextType>();
    return type !== 'http' && type !== 'graphql';
  }

  protected override getRequestResponse(context: ExecutionContext): { req: Request; res: Response } {
    if (context.getType<GqlContextType>() !== 'graphql') {
      const http = context.switchToHttp();
      return { req: http.getRequest<Request>(), res: http.getResponse<Response>() };
    }
    // Apollo's context only has the request; Express links it to its response.
    const { req } = GqlExecutionContext.create(context).getContext<{ req: Request }>();
    return { req, res: req.res as Response };
  }

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
