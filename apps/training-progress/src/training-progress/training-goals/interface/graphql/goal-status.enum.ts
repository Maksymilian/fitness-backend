import { registerEnumType } from '@nestjs/graphql';

/** The goal statuses in the GraphQL schema. */
export enum GoalStatusEnum {
  ACTIVE = 'ACTIVE',
  ACHIEVED = 'ACHIEVED',
  MISSED = 'MISSED',
  ABANDONED = 'ABANDONED',
}

registerEnumType(GoalStatusEnum, { name: 'GoalStatus' });
