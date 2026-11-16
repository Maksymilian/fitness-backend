import { OutboxTransport, type OutboxMessage } from '@nestjs/outbox';
import { context, propagation, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { startTestSdk } from '../test/test-sdk.js';
import { currentFlowId } from './flow.js';
import { traceHeaders } from './staged-trace.js';
import { TracedTransport } from './traced-transport.js';

/** Records the flow and the active span each message is published in. */
class RecordingTransport extends OutboxTransport {
  static readonly published: Array<{ flowId?: string; spanName?: string }> = [];

  publish(): void {
    const span = trace.getActiveSpan() as unknown as { name?: string } | undefined;
    RecordingTransport.published.push({ flowId: currentFlowId(), spanName: span?.name });
  }
}

describe('TracedTransport', () => {
  const sdk = startTestSdk();
  afterAll(() => sdk.stop());

  it('hands each message to its transport in the trace and flow that staged it', async () => {
    const caller = propagation.extract(ROOT_CONTEXT, { baggage: 'session.id=flow-1' });
    const headers = context.with(caller, () => trace.getTracer('test').startActiveSpan('request', (span) => (span.end(), traceHeaders())));
    const Transport = TracedTransport(RecordingTransport);

    await new Transport().publish({ id: 'm-1', topic: 'workout-tracking.integration.workout-recorded.v1', headers } as unknown as OutboxMessage, {
      signal: new AbortController().signal,
    });

    expect(RecordingTransport.published).toEqual([{ flowId: 'flow-1', spanName: 'relay workout-tracking.integration.workout-recorded.v1' }]);
  });
});
