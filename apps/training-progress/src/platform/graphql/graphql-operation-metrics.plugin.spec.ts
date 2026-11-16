import type { BaseContext, GraphQLRequestContextWillSendResponse } from '@apollo/server';
import { metrics } from '@opentelemetry/api';
import { AggregationTemporality, type DataPoint, type Histogram, MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import { GraphQLError, type OperationDefinitionNode, parse } from 'graphql';
import { GraphqlOperationMetricsPlugin } from './graphql-operation-metrics.plugin.js';

/** Collects on demand, like the SDK's periodic reader does every 10 s. */
class CollectingReader extends MetricReader {
  constructor() {
    super({ aggregationTemporalitySelector: () => AggregationTemporality.DELTA });
  }
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

describe('GraphqlOperationMetricsPlugin', () => {
  const reader = new CollectingReader();
  beforeAll(() => metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] })));
  afterAll(() => metrics.disable());

  /** Runs one request through the plugin, and answers the data points recorded since the last one. */
  async function request(source: string, errors?: GraphQLError[]) {
    const plugin = new GraphqlOperationMetricsPlugin();
    const operation = parse(source).definitions[0] as OperationDefinitionNode;
    const listener = await plugin.requestDidStart();
    await listener.willSendResponse?.({ operation, errors } as unknown as GraphQLRequestContextWillSendResponse<BaseContext>);
    const { resourceMetrics } = await reader.collect();
    return resourceMetrics.scopeMetrics.flatMap((scope) => scope.metrics).flatMap((metric) => metric.dataPoints as Array<DataPoint<Histogram>>);
  }

  it('records an operation by its type and root fields', async () => {
    const [point] = await request('query MemberSummary { member(id: "ada@example.com") { id } }');

    expect(point.attributes).toEqual({ 'graphql.operation.type': 'query', 'graphql.root_fields': 'member' });
    expect(point.value.count).toBe(1);
  });

  it("records a failed operation with its first error's code", async () => {
    const [point] = await request('mutation { abandonTrainingGoal(input: {}) { id } }', [new GraphQLError('Not active', { extensions: { code: 'CONFLICT' } })]);

    expect(point.attributes).toEqual({ 'graphql.operation.type': 'mutation', 'graphql.root_fields': 'abandonTrainingGoal', 'error.type': 'CONFLICT' });
  });

  it("doesn't record introspection", async () => {
    expect(await request('query IntrospectionQuery { __schema { queryType { name } } }')).toEqual([]);
  });
});
