import { Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { metrics, trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { MessageFlowInterceptor } from './message-flow.interceptor.js';
import { countResilienceEvents } from './resilience-metrics.js';

interface Flushable {
  forceFlush?: () => Promise<void>;
  getDelegate?: () => Flushable;
}

/**
 * The service side of OpenTelemetry (the SDK itself starts before the service, from
 * instrumentation.ts): message handlers run in their flow, @nestjs/resilience's events are counted,
 * and on shutdown, after the outbox relay drained, the last spans, metrics and logs are exported
 * before the process exits.
 */
@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: MessageFlowInterceptor }],
})
export class TelemetryModule implements OnModuleInit, OnApplicationShutdown {
  private stopCountingResilienceEvents?: () => void;

  onModuleInit(): void {
    this.stopCountingResilienceEvents = countResilienceEvents();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopCountingResilienceEvents?.();
    const tracerProvider = trace.getTracerProvider() as Flushable;
    const providers = [tracerProvider.getDelegate?.() ?? tracerProvider, metrics.getMeterProvider(), logs.getLoggerProvider()];
    await Promise.allSettled(providers.map(async (provider) => (provider as Flushable).forceFlush?.()));
  }
}
