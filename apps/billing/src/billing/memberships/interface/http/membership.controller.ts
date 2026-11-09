import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Timeout } from '@nestjs/resilience';
import { OpenBillingPortalCommand } from '../../application/commands/open-billing-portal.command.js';
import { StartCheckoutCommand } from '../../application/commands/start-checkout.command.js';
import { MembershipQuery } from '../../application/queries/membership.query.js';
import { MemberId } from '../../domain/values/member-id.js';
import { MembershipPlan } from '../../domain/values/membership-plan.js';
import { MemberParams } from './dto/member.params.js';
import { StartCheckoutDto } from './dto/start-checkout.dto.js';

/**
 * A member's membership, and the payment provider's pages that change it. Until Identity exists,
 * the member is chosen by id in the path; later it comes from the access token.
 */
@Controller({ path: 'members/:memberId', version: '1' })
export class MembershipController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('membership')
  @Timeout()
  membership(@Param() { memberId }: MemberParams) {
    return this.queryBus.execute(new MembershipQuery(memberIdOf(memberId)));
  }

  /** A checkout for a plan: the member pays on the provider's page, and the membership starts once they did. */
  @Post('checkouts')
  startCheckout(@Param() { memberId }: MemberParams, @Body() { plan }: StartCheckoutDto) {
    return this.commandBus.execute(new StartCheckoutCommand(memberIdOf(memberId), MembershipPlan.from(plan)));
  }

  /** The provider's billing portal: switch plans, cancel or resume renewal, change the card, read invoices. */
  @Post('billing-portal')
  @HttpCode(HttpStatus.OK)
  openBillingPortal(@Param() { memberId }: MemberParams) {
    return this.commandBus.execute(new OpenBillingPortalCommand(memberIdOf(memberId)));
  }
}

function memberIdOf(memberId: string): MemberId {
  return MemberId.from(memberId.toLowerCase());
}
