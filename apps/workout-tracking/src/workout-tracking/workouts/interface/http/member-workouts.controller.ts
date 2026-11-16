import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Timeout } from '@nestjs/resilience';
import { MemberId } from '../../../equipment/domain/values/member-id.js';
import { ListMemberWorkoutsQuery } from '../../application/queries/list-member-workouts.query.js';
import { ListMemberWorkoutsDto } from './dto/list-member-workouts.dto.js';

/** REST endpoint for a member's workouts. */
@Controller({ path: 'members/:memberId/workouts', version: '1' })
export class MemberWorkoutsController {
  constructor(private readonly queryBus: QueryBus) {}

  /** A member's workouts, newest first, voided ones included. */
  @Get()
  @Timeout()
  list(@Param('memberId') memberId: string, @Query() { limit, cursor }: ListMemberWorkoutsDto) {
    return this.queryBus.execute(new ListMemberWorkoutsQuery(MemberId.from(memberId.toLowerCase()), limit, cursor ?? null));
  }
}
