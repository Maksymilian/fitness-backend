import { BillingTopics } from '@app/billing-contracts';
import type { CommandBus } from '@nestjs/cqrs';
import { InvalidIntegrationEvent } from '../workout-tracking-acl/invalid-integration-event.js';
import { BillingEventsController } from './billing-events.controller.js';
import type { MembershipSnapshotTranslator } from './membership-snapshot.translator.js';

describe('BillingEventsController', () => {
  const event = { specversion: '1.0', id: 'e-1', type: BillingTopics.membershipStartedV1 } as never;

  function controller(translate: () => Promise<unknown>, execute = vi.fn(async () => undefined)) {
    const channel = { ack: vi.fn(), nack: vi.fn() };
    const context = { getChannelRef: () => channel, getMessage: () => ({}) };
    const handlers = new BillingEventsController({ execute } as unknown as CommandBus, { translate } as unknown as MembershipSnapshotTranslator);
    return { handlers, channel, context, execute };
  }

  it('acks once the command committed', async () => {
    const { handlers, channel, context, execute } = controller(async () => ({ change: 'extend' }));

    await handlers.membershipStarted(event, context);

    expect(execute).toHaveBeenCalledOnce();
    expect(channel.ack).toHaveBeenCalledOnce();
  });

  it('dead-letters an invalid event at once', async () => {
    const { handlers, channel, context } = controller(async () => {
      throw new InvalidIntegrationEvent('x', 'broken');
    });

    await handlers.membershipEnded(event, context);

    expect(channel.nack).toHaveBeenCalledWith({}, false, false);
  });

  it('requeues any other failure', async () => {
    const { handlers, channel, context } = controller(
      async () => ({}),
      vi.fn(async () => {
        throw new Error('lock conflict');
      }),
    );

    await handlers.membershipStarted(event, context);

    expect(channel.nack).toHaveBeenCalledWith({}, false, true);
  });
});
