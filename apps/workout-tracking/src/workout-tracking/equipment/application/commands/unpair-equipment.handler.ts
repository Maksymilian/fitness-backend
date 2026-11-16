import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactions } from '../../../../platform/database/transactions.js';
import { DomainEventPublisher } from '../../../../platform/outbox/domain-event-publisher.js';
import { EquipmentRepository } from '../../domain/equipment.repository.js';
import { UnpairEquipmentCommand } from './unpair-equipment.command.js';

/** Unpairs equipment: loads it, calls `unpair`, saves it and stages its events in one transaction. */
@CommandHandler(UnpairEquipmentCommand)
export class UnpairEquipmentHandler implements ICommandHandler<UnpairEquipmentCommand> {
  constructor(
    private readonly equipmentRepository: EquipmentRepository,
    private readonly transactions: Transactions,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute({ equipmentId }: UnpairEquipmentCommand) {
    const equipment = await this.equipmentRepository.get(equipmentId);
    equipment.unpair(new Date());
    await this.transactions.run(async (tx) => {
      await this.equipmentRepository.save(tx, equipment);
      await this.events.publish(tx, equipment.pullDomainEvents());
    });
  }
}
