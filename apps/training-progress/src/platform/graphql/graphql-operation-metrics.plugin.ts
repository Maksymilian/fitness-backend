import type { ApolloServerPlugin, BaseContext, GraphQLRequestContextWillSendResponse, GraphQLRequestListener } from '@apollo/server';
import { Plugin } from '@nestjs/apollo';
import { type Histogram, metrics } from '@opentelemetry/api';
import { Kind, type OperationDefinitionNode } from 'graphql';

/**
 * GraphQL's own request metric: every request is `POST /graphql` to the HTTP metric, so this one
 * tells the operations apart, as `graphql.server.operation.duration` (seconds; in Prometheus,
 * `graphql_server_operation_duration_seconds`). By the operation's type and its root fields, which the schema bounds (operation
 * names are the client's: any number of them), and the first error's code. Introspection, which
 * GraphQL tools poll, isn't recorded.
 */
@Plugin()
export class GraphqlOperationMetricsPlugin implements ApolloServerPlugin {
  // Created with the plugin, after the OpenTelemetry SDK started (instrumentation.ts).
  private readonly duration: Histogram = metrics.getMeter('training-progress.graphql').createHistogram('graphql.server.operation.duration', {
    unit: 's',
    description: 'Duration of GraphQL operations',
    // The HTTP conventions' buckets, in seconds; the SDK's default ones are for milliseconds.
    advice: { explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10] },
  });

  async requestDidStart(): Promise<GraphQLRequestListener<BaseContext>> {
    const started = performance.now();
    return {
      willSendResponse: async (requestContext: GraphQLRequestContextWillSendResponse<BaseContext>) => {
        const rootFields = rootFieldsOf(requestContext.operation);
        if (rootFields.length > 0 && rootFields.every((field) => field.startsWith('__'))) {
          return;
        }
        const errorCode = requestContext.errors?.[0]?.extensions?.code;
        this.duration.record((performance.now() - started) / 1000, {
          'graphql.operation.type': requestContext.operation?.operation ?? 'unknown',
          'graphql.root_fields': rootFields.length > 0 ? rootFields.join(',') : 'unknown',
          ...(requestContext.errors?.length ? { 'error.type': typeof errorCode === 'string' ? errorCode : 'GRAPHQL_ERROR' } : {}),
        });
      },
    };
  }
}

/** The operation's root fields, sorted: `member`, `setTrainingGoal`... */
function rootFieldsOf(operation: OperationDefinitionNode | undefined): string[] {
  const fields = operation?.selectionSet.selections.flatMap((selection) => (selection.kind === Kind.FIELD ? [selection.name.value] : [])) ?? [];
  return [...new Set(fields)].sort();
}
