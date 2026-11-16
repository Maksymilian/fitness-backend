import { Body, Controller, HttpStatus, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { Response } from 'express';
import { EquipmentId } from '../../../equipment/domain/values/equipment-id.js';
import { RecordWorkoutCommand } from '../../application/commands/record-workout.command.js';
import { Discipline } from '../../domain/values/discipline.js';
import { Recording } from '../../domain/values/recording.js';
import { RecordingId } from '../../domain/values/recording-id.js';
import { WorkoutMetrics } from '../../domain/values/workout-metrics.js';
import { RecordWorkoutDto } from './dto/record-workout.dto.js';

/** REST endpoint where equipment sends its recordings. */
@Controller({ path: 'equipment/:equipmentId/recordings', version: '1' })
export class RecordingsController {
  constructor(private readonly commandBus: CommandBus) {}

  /** `201` with the new workout, or `200` with the existing one for a duplicate recording. */
  @Post()
  async record(@Param('equipmentId', ParseUUIDPipe) equipmentId: string, @Body() dto: RecordWorkoutDto, @Res({ passthrough: true }) response: Response) {
    const recording = new Recording(RecordingId.from(dto.recordingId), Discipline.from(dto.discipline), new Date(dto.startedAt), WorkoutMetrics.of(dto));
    const { workout, duplicate } = await this.commandBus.execute(new RecordWorkoutCommand(EquipmentId.from(equipmentId), recording));
    response.status(duplicate ? HttpStatus.OK : HttpStatus.CREATED);
    return workout;
  }
}
