import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Timeout } from '@nestjs/resilience';
import { PairEquipmentCommand } from '../../application/commands/pair-equipment.command.js';
import { RegisterEquipmentCommand } from '../../application/commands/register-equipment.command.js';
import { UnpairEquipmentCommand } from '../../application/commands/unpair-equipment.command.js';
import { GetEquipmentQuery } from '../../application/queries/get-equipment.query.js';
import { EquipmentId } from '../../domain/values/equipment-id.js';
import { EquipmentType } from '../../domain/values/equipment-type.js';
import { MemberId } from '../../domain/values/member-id.js';
import { SerialNumber } from '../../domain/values/serial-number.js';
import { PairEquipmentDto } from './dto/pair-equipment.dto.js';
import { RegisterEquipmentDto } from './dto/register-equipment.dto.js';

/** REST endpoints to register, pair, unpair and read equipment. */
@Controller({ path: 'equipment', version: '1' })
export class EquipmentController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  register(@Body() dto: RegisterEquipmentDto) {
    return this.commandBus.execute(new RegisterEquipmentCommand(SerialNumber.from(dto.serialNumber), EquipmentType.from(dto.type)));
  }

  @Get(':equipmentId')
  @Timeout()
  get(@Param('equipmentId', ParseUUIDPipe) equipmentId: string) {
    return this.queryBus.execute(new GetEquipmentQuery(EquipmentId.from(equipmentId)));
  }

  @Put(':equipmentId/pairing')
  pair(@Param('equipmentId', ParseUUIDPipe) equipmentId: string, @Body() dto: PairEquipmentDto) {
    return this.commandBus.execute(new PairEquipmentCommand(EquipmentId.from(equipmentId), MemberId.from(dto.memberId)));
  }

  @Delete(':equipmentId/pairing')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unpair(@Param('equipmentId', ParseUUIDPipe) equipmentId: string) {
    await this.commandBus.execute(new UnpairEquipmentCommand(EquipmentId.from(equipmentId)));
  }
}
