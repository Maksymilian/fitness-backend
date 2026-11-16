import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, type ThrottlerStorage } from '@nestjs/throttler';
import { context as otelContext, metrics, SpanStatusCode, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { AggregationTemporality, type DataPoint, MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { RateLimitGuard } from './rate-limit.guard.js';

/** Collects on demand, like the SDK's periodic reader does every 10 s. */
class CollectingReader extends MetricReader {
  constructor() {
    super({ aggregationTemporalitySelector: () => AggregationTemporality.DELTA });
  }
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

class MemberResolver {}
/** The handler: the guard reads its name. */
function member() {}

describe('RateLimitGuard', () => {
  const reader = new CollectingReader();
  const spans = new InMemorySpanExporter();
  beforeAll(() => {
    metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));
    trace.setGlobalTracerProvider(new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(spans)] }));
    otelContext.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  });
  afterAll(() => {
    metrics.disable();
    trace.disable();
    otelContext.disable();
  });
  // Each test sees only its own rejections.
  beforeEach(async () => {
    await reader.collect();
  });

  /** A guard that allows 1 request per minute, in memory. */
  async function guard() {
    const hits = new Map<string, number>();
    const storage: ThrottlerStorage = {
      increment: async (key, ttl, limit) => {
        const totalHits = (hits.get(key) ?? 0) + 1;
        hits.set(key, totalHits);
        return { totalHits, timeToExpire: ttl / 1000, isBlocked: totalHits > limit, timeToBlockExpire: ttl / 1000 };
      },
    };
    const rateLimit = new RateLimitGuard({ throttlers: [{ ttl: 60_000, limit: 1 }] }, storage, new Reflector());
    await rateLimit.onModuleInit();
    return rateLimit;
  }

  /** The context of a GraphQL root field: Apollo's context (args[2]) has the request, linked to its response. */
  function graphqlContext(): ExecutionContext {
    const context = { req: { ip: '127.0.0.1', headers: {}, res: { header: vi.fn() } } };
    return {
      getType: () => 'graphql',
      getClass: () => MemberResolver,
      getHandler: () => member,
      getArgs: () => [{}, {}, context, {}],
      getArgByIndex: (index: number) => [{}, {}, context, {}][index],
    } as unknown as ExecutionContext;
  }

  async function rejectedRequests() {
    const { resourceMetrics } = await reader.collect();
    return resourceMetrics.scopeMetrics.flatMap((scope) => scope.metrics).flatMap((metric) => metric.dataPoints as Array<DataPoint<number>>);
  }

  it('rejects a GraphQL request past the limit, and counts it by resolver', async () => {
    const rateLimit = await guard();
    expect(await rateLimit.canActivate(graphqlContext())).toBe(true);

    await expect(rateLimit.canActivate(graphqlContext())).rejects.toBeInstanceOf(ThrottlerException);
    const [point] = await rejectedRequests();
    expect(point.attributes).toEqual({ 'nestjs.handler': 'MemberResolver.member' });
  });

  it("marks the rejection on the GraphQL field's span: an event with the limit, and the error status", async () => {
    const rateLimit = await guard();

    await trace.getTracer('test').startActiveSpan('graphql.resolve member', async (span) => {
      await rateLimit.canActivate(graphqlContext());
      await expect(rateLimit.canActivate(graphqlContext())).rejects.toBeInstanceOf(ThrottlerException);
      span.end();
    });

    const [span] = spans.getFinishedSpans();
    expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: 'Too many requests' });
    expect(span.events.map(({ name, attributes }) => ({ name, attributes }))).toEqual([
      {
        name: 'rate_limit.rejected',
        attributes: { 'nestjs.handler': 'MemberResolver.member', 'rate_limit.limit': 1, 'rate_limit.window_seconds': 60, 'rate_limit.retry_after_seconds': 60 },
      },
    ]);
  });

  it('rejects an HTTP request past the limit with 429', async () => {
    const rateLimit = await guard();
    const response = { header: vi.fn() };
    const http = {
      getType: () => 'http',
      getClass: () => MemberResolver,
      getHandler: () => member,
      switchToHttp: () => ({ getRequest: () => ({ ip: '127.0.0.1', headers: {} }), getResponse: () => response }),
    } as unknown as ExecutionContext;
    await rateLimit.canActivate(http);

    await expect(rateLimit.canActivate(http)).rejects.toBeInstanceOf(ThrottlerException);
    expect(response.header).toHaveBeenCalledWith('Retry-After', 60);
  });

  it('lets every RabbitMQ message through: messages are not requests', async () => {
    const rateLimit = await guard();
    const message = { getType: () => 'rpc', getClass: () => MemberResolver, getHandler: () => member } as unknown as ExecutionContext;

    expect(await rateLimit.canActivate(message)).toBe(true);
    expect(await rateLimit.canActivate(message)).toBe(true);
    expect(await rejectedRequests()).toEqual([]);
  });
});
