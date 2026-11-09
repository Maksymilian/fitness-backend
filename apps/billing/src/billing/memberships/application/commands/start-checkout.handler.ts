import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { MembershipAlreadyActive } from '../../domain/errors/membership-already-active.js';
import { MembershipQueries } from '../queries/membership-queries.js';
import { PaymentProvider } from '../payment-provider.js';
import { StartCheckoutCommand } from './start-checkout.command.js';

/**
 * Sends a member without an active membership to the payment provider's checkout. Nothing changes
 * here: the membership starts when the provider reports the payment.
 */
@CommandHandler(StartCheckoutCommand)
export class StartCheckoutHandler implements ICommandHandler<StartCheckoutCommand> {
  constructor(
    private readonly memberships: MembershipQueries,
    private readonly paymentProvider: PaymentProvider,
  ) {}

  async execute({ memberId, plan }: StartCheckoutCommand) {
    if ((await this.memberships.ofMember(memberId.value))?.status === 'ACTIVE') {
      throw new MembershipAlreadyActive(memberId.value);
    }
    return this.paymentProvider.startCheckout(memberId, plan);
  }
}
