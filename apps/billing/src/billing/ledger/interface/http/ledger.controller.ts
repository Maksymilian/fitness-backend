import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Timeout } from '@nestjs/resilience';
import { MemberId } from '../../../memberships/domain/values/member-id.js';
import { MemberParams } from '../../../memberships/interface/http/dto/member.params.js';
import { LedgerQuery } from '../../application/queries/ledger.query.js';
import { LedgerDto } from './dto/ledger.dto.js';

@Controller({ path: 'members/:memberId/ledger', version: '1' })
export class LedgerController {
  constructor(private readonly queryBus: QueryBus) {}

  /** A member's payments and refunds, newest first. Amounts are text ("9.99"): exact. */
  @Get()
  @Timeout()
  ledger(@Param() { memberId }: MemberParams, @Query() { limit, cursor }: LedgerDto) {
    return this.queryBus.execute(new LedgerQuery(MemberId.from(memberId.toLowerCase()), limit, cursor ?? null));
  }
}
