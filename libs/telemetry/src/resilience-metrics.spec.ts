import { channel } from 'node:diagnostics_channel';
import { metrics } from '@opentelemetry/api';
import { AggregationTemporality, type DataPoint, MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import { countResilienceEvents } from './resilience-metrics.js';

/** Collects on demand, like the SDK's periodic reader does every 10 s. */
class CollectingReader extends MetricReader {
  constructor() {
    super({ aggregationTemporalitySelector: () => AggregationTemporality.DELTA });
  }
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

describe('countResilienceEvents', () => {
  const reader = new CollectingReader();
  beforeAll(() => metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] })));
  afterAll(() => metrics.disable());

  async function counted() {
    const { resourceMetrics } = await reader.collect();
    return resourceMetrics.scopeMetrics.flatMap((scope) => scope.metrics).flatMap((metric) => metric.dataPoints as Array<DataPoint<number>>);
  }

  it('counts each event from the diagnostics channels by type, name and source', async () => {
    const stop = countResilienceEvents();
    const timeout = { type: 'timeout', policy: 'MemberResolver.trainingGoals', source: 'MemberResolver.trainingGoals', timeoutMs: 3000 };
    channel('nestjs:resilience:timeout').publish(timeout);
    channel('nestjs:resilience:timeout').publish(timeout);
    channel('nestjs:resilience:circuit-open').publish({ type: 'circuit-open', policy: 'database', from: 'closed', to: 'open' });
    stop();

    expect(await counted()).toEqual([
      expect.objectContaining({
        attributes: { 'resilience.event': 'timeout', 'resilience.name': 'MemberResolver.trainingGoals', 'resilience.source': 'MemberResolver.trainingGoals' },
        value: 2,
      }),
      expect.objectContaining({ attributes: { 'resilience.event': 'circuit-open', 'resilience.name': 'database' }, value: 1 }),
    ]);
  });

  it('stops counting once stopped', async () => {
    countResilienceEvents()();
    channel('nestjs:resilience:retry').publish({ type: 'retry', policy: 'database', attempt: 1, delayMs: 100 });

    expect(await counted()).toEqual([]);
  });
});
