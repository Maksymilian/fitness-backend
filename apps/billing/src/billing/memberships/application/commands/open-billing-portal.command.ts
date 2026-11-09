import { Command } from '@nestjs/cqrs';
import type { MemberId } from '../../domain/values/member-id.js';
import type { ProviderPage } from '../payment-provider.js';

export class OpenBillingPortalCommand extends Command<ProviderPage> {
  constructor(readonly memberId: MemberId) {
    super();
  }
}
