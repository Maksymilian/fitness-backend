import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Timeout } from '@nestjs/resilience';
import { CorrectWorkoutCommand } from '../../application/commands/correct-workout.command.js';
import { VoidWorkoutCommand } from '../../application/commands/void-workout.command.js';
import { GetWorkoutQuery } from '../../application/queries/get-workout.query.js';
import { CorrectionReason } from '../../domain/values/correction-reason.js';
import { VoidReason } from '../../domain/values/void-reason.js';
import { WorkoutId } from '../../domain/values/workout-id.js';
import { WorkoutMetrics } from '../../domain/values/workout-metrics.js';
import { CorrectWorkoutDto } from './dto/correct-workout.dto.js';
import { VoidWorkoutDto } from './dto/void-workout.dto.js';

/** REST endpoints to read, correct and void a workout. */
@Controller({ path: 'workouts', version: '1' })
export class WorkoutsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get(':workoutId')
  @Timeout()
  get(@Param('workoutId', ParseUUIDPipe) workoutId: string) {
    return this.queryBus.execute(new GetWorkoutQuery(WorkoutId.from(workoutId)));
  }

  /** A correction is a business action with a reason, a new revision and an event: not an update. */
  @Post(':workoutId/corrections')
  @HttpCode(HttpStatus.OK)
  correct(@Param('workoutId', ParseUUIDPipe) workoutId: string, @Body() dto: CorrectWorkoutDto) {
    return this.commandBus.execute(new CorrectWorkoutCommand(WorkoutId.from(workoutId), WorkoutMetrics.of(dto), CorrectionReason.from(dto.reason)));
  }

  /** Voiding keeps the workout, so it isn't a DELETE. */
  @Post(':workoutId/void')
  @HttpCode(HttpStatus.OK)
  void(@Param('workoutId', ParseUUIDPipe) workoutId: string, @Body() dto: VoidWorkoutDto) {
    return this.commandBus.execute(new VoidWorkoutCommand(WorkoutId.from(workoutId), VoidReason.from(dto.reason)));
  }
}
