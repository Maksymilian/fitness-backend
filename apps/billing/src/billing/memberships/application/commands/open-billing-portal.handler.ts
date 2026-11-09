import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { MembershipNotFound } from '../../domain/errors/membership-not-found.js';
import { MembershipQueries } from '../queries/membership-queries.js';
import { PaymentProvider } from '../payment-provider.js';
import { OpenBillingPortalCommand } from './open-billing-portal.command.js';

/** Sends a member who has, or had, a membership to the payment provider's billing portal. */
@CommandHandler(OpenBillingPortalCommand)
export class OpenBillingPortalHandler implements ICommandHandler<OpenBillingPortalCommand> {
  constructor(
    private readonly memberships: MembershipQueries,
    private readonly paymentProvider: PaymentProvider,
  ) {}

  async execute({ memberId }: OpenBillingPortalCommand) {
    if (!(await this.memberships.ofMember(memberId.value))) {
      throw new MembershipNotFound(memberId.value);
    }
    return this.paymentProvider.openBillingPortal(memberId);
  }
}
