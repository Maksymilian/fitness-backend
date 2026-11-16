import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactions } from '../../../../platform/database/transactions.js';
import { DomainEventPublisher } from '../../../../platform/outbox/domain-event-publisher.js';
import { EquipmentRepository } from '../../domain/equipment.repository.js';
import { representEquipment } from '../equipment.representation.interface.js';
import { PairEquipmentCommand } from './pair-equipment.command.js';

/** Pairs equipment with a member: loads it, calls `pair`, saves it and stages its events in one transaction. */
@CommandHandler(PairEquipmentCommand)
export class PairEquipmentHandler implements ICommandHandler<PairEquipmentCommand> {
  constructor(
    private readonly equipmentRepository: EquipmentRepository,
    private readonly transactions: Transactions,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute({ equipmentId, memberId }: PairEquipmentCommand) {
    const equipment = await this.equipmentRepository.get(equipmentId);
    equipment.pair(memberId, new Date());
    if (equipment.hasChanges()) {
      await this.transactions.run(async (tx) => {
        await this.equipmentRepository.save(tx, equipment);
        await this.events.publish(tx, equipment.pullDomainEvents());
      });
    }
    return representEquipment(equipment);
  }
}
