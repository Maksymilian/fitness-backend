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

class EquipmentController {}
/** The handler: the guard reads its name. */
function get() {}

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

  /** A guard that allows 2 requests per minute, in memory, and the context of one GET request. */
  async function guard() {
    const hits = new Map<string, number>();
    const storage: ThrottlerStorage = {
      increment: async (key, ttl, limit) => {
        const totalHits = (hits.get(key) ?? 0) + 1;
        hits.set(key, totalHits);
        return { totalHits, timeToExpire: ttl / 1000, isBlocked: totalHits > limit, timeToBlockExpire: ttl / 1000 };
      },
    };
    const rateLimit = new RateLimitGuard({ throttlers: [{ ttl: 60_000, limit: 2 }] }, storage, new Reflector());
    await rateLimit.onModuleInit();
    const response = { header: vi.fn() };
    const context = {
      getType: () => 'http',
      getClass: () => EquipmentController,
      getHandler: () => get,
      switchToHttp: () => ({ getRequest: () => ({ ip: '127.0.0.1', headers: {} }), getResponse: () => response }),
    } as unknown as ExecutionContext;
    return { rateLimit, context };
  }

  async function rejectedRequests() {
    const { resourceMetrics } = await reader.collect();
    return resourceMetrics.scopeMetrics.flatMap((scope) => scope.metrics).flatMap((metric) => metric.dataPoints as DataPoint<number>[]);
  }

  it('lets requests through up to the limit, without counting a rejection', async () => {
    const { rateLimit, context } = await guard();

    expect(await rateLimit.canActivate(context)).toBe(true);
    expect(await rateLimit.canActivate(context)).toBe(true);
    expect(await rejectedRequests()).toEqual([]);
  });

  it('rejects the request past the limit with 429, and counts it by handler', async () => {
    const { rateLimit, context } = await guard();
    await rateLimit.canActivate(context);
    await rateLimit.canActivate(context);

    await expect(rateLimit.canActivate(context)).rejects.toBeInstanceOf(ThrottlerException);
    const [point] = await rejectedRequests();
    expect(point.attributes).toEqual({ 'nestjs.handler': 'EquipmentController.get' });
    expect(point.value).toBe(1);
  });

  it("marks the rejection on the handler's span: an event with the limit, and the error status", async () => {
    const { rateLimit, context } = await guard();

    await trace.getTracer('test').startActiveSpan('EquipmentController.get', async (span) => {
      await rateLimit.canActivate(context);
      await rateLimit.canActivate(context);
      await expect(rateLimit.canActivate(context)).rejects.toBeInstanceOf(ThrottlerException);
      span.end();
    });

    const [span] = spans.getFinishedSpans();
    expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: 'Too many requests' });
    expect(span.events.map(({ name, attributes }) => ({ name, attributes }))).toEqual([
      {
        name: 'rate_limit.rejected',
        attributes: { 'nestjs.handler': 'EquipmentController.get', 'rate_limit.limit': 2, 'rate_limit.window_seconds': 60, 'rate_limit.retry_after_seconds': 60 },
      },
    ]);
  });
});
