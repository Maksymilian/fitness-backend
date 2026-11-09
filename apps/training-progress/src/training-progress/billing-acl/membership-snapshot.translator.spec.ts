import { BILLING_SOURCE, BillingTopics } from '@app/billing-contracts';
import { InvalidIntegrationEvent } from '../workout-tracking-acl/invalid-integration-event.js';
import { MembershipSnapshotTranslator } from './membership-snapshot.translator.js';

const snapshot = {
  membershipId: '0199c3a2-0000-7000-8000-000000000301',
  memberId: 'ada@example.com',
  plan: 'MONTHLY',
  status: 'ACTIVE',
  paidThrough: '2026-11-30T10:00:00.000Z',
  renews: true,
  revision: 3,
};
const cloudEvent = (type: string, data: unknown, source = BILLING_SOURCE) => ({
  specversion: '1.0',
  id: '0199c3a2-0000-7000-8000-0000000003ff',
  source,
  type,
  datacontenttype: 'application/json',
  data,
});

describe('MembershipSnapshotTranslator', () => {
  const translator = new MembershipSnapshotTranslator();

  it("translates a membership that started into Extend, with the membership's revision as the source revision", async () => {
    const command = await translator.translate(cloudEvent(BillingTopics.membershipStartedV1, snapshot));

    expect(command).toMatchObject({ change: 'extend', messageId: '0199c3a2-0000-7000-8000-0000000003ff' });
    expect(command.memberId.value).toBe('ada@example.com');
    expect(command.sourceRevision.value).toBe(3);
  });

  it('translates a membership that ended into Restrict', async () => {
    expect(await translator.translate(cloudEvent(BillingTopics.membershipEndedV1, { ...snapshot, status: 'ENDED' }))).toMatchObject({ change: 'restrict' });
  });

  it.each([
    ['another source', cloudEvent(BillingTopics.membershipStartedV1, snapshot, '/workout-tracking')],
    ['a payload that breaks the contract', cloudEvent(BillingTopics.membershipStartedV1, { ...snapshot, revision: 0 })],
    ['an event Training Progress does not know', cloudEvent('billing.integration.membership-renewed.v1', snapshot)],
  ])('refuses %s, for the DLQ', async (_, event) => {
    await expect(translator.translate(event)).rejects.toThrow(InvalidIntegrationEvent);
  });
});
