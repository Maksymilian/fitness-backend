import type { OutboxHandlerContext } from '@nestjs/outbox';
import { context, propagation, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { startTestSdk } from '../test/test-sdk.js';
import { currentFlowId } from './flow.js';
import { OnTracedOutboxMessage } from './on-traced-outbox-message.decorator.js';
import { traceHeaders } from './staged-trace.js';

class LoggedWorkoutHandler {
  readonly handled: Array<{ payload: unknown; flowId?: string; self: unknown }> = [];

  @OnTracedOutboxMessage('training-progress.domain.workout-logged.v1', { consumer: 'test' })
  async handle(payload: unknown) {
    this.handled.push({ payload, flowId: currentFlowId(), self: this });
  }
}

describe('OnTracedOutboxMessage', () => {
  const sdk = startTestSdk();
  afterAll(() => sdk.stop());

  it('runs the handler, on its own instance, in the trace and flow that staged the message', async () => {
    const caller = propagation.extract(ROOT_CONTEXT, { baggage: 'session.id=flow-1' });
    const headers = context.with(caller, () => trace.getTracer('test').startActiveSpan('request', (span) => (span.end(), traceHeaders())));
    const message = { id: 'message-1', topic: 'training-progress.domain.workout-logged.v1', headers };
    const handler = new LoggedWorkoutHandler();

    await handler.handle({ workoutId: 'w-1' }, { message } as unknown as OutboxHandlerContext);

    expect(handler.handled).toEqual([{ payload: { workoutId: 'w-1' }, flowId: 'flow-1', self: handler }]);
    expect(sdk.spans.getFinishedSpans().map((span) => span.name)).toContain('process training-progress.domain.workout-logged.v1');
  });
});
