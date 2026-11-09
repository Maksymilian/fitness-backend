import { Module } from '@nestjs/common';
import { CheckGoalAchievementPolicy } from './application/check-goal-achievement.policy.js';
import { ChangeGoalAllowanceHandler } from './application/commands/change-goal-allowance.handler.js';
import { AbandonTrainingGoalHandler } from './application/commands/abandon-training-goal.handler.js';
import { MissEndedGoalsHandler } from './application/commands/miss-ended-goals.handler.js';
import { SetTrainingGoalHandler } from './application/commands/set-training-goal.handler.js';
import { TrainingGoalProgressHandler } from './application/queries/training-goal-progress.handler.js';
import { TrainingGoalQueries } from './application/queries/training-goal-queries.js';
import { TrainingGoalsHandler } from './application/queries/training-goals.handler.js';
import { TrainingLogTotals } from './application/training-log-totals.js';
import { GoalAllowanceRepository } from './domain/goal-allowance.repository.js';
import { TrainingGoalRepository } from './domain/training-goal.repository.js';
import { DrizzleGoalAllowanceRepository } from './infrastructure/drizzle-goal-allowance.repository.js';
import { DrizzleTrainingGoalQueries } from './infrastructure/drizzle-training-goal-queries.js';
import { DrizzleTrainingGoalRepository } from './infrastructure/drizzle-training-goal.repository.js';
import { DrizzleTrainingLogTotals } from './infrastructure/drizzle-training-log-totals.js';
import { TrainingGoalsResolver } from './interface/graphql/training-goals.resolver.js';
import { ScheduleTriggersController } from './interface/schedule/schedule-triggers.controller.js';
import { TrainingGoalsBotCommands } from './interface/telegram/training-goals-bot-commands.js';

@Module({
  providers: [
    TrainingGoalsResolver,
    SetTrainingGoalHandler,
    ChangeGoalAllowanceHandler,
    AbandonTrainingGoalHandler,
    CheckGoalAchievementPolicy,
    MissEndedGoalsHandler,
    TrainingGoalsHandler,
    TrainingGoalProgressHandler,
    { provide: TrainingGoalRepository, useClass: DrizzleTrainingGoalRepository },
    { provide: GoalAllowanceRepository, useClass: DrizzleGoalAllowanceRepository },
    { provide: TrainingLogTotals, useClass: DrizzleTrainingLogTotals },
    { provide: TrainingGoalQueries, useClass: DrizzleTrainingGoalQueries },
    TrainingGoalsBotCommands,
  ],
  controllers: [ScheduleTriggersController],
})
export class TrainingGoalsModule {}
