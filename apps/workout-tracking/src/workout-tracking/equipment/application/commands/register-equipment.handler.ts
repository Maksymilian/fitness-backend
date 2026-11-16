import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactions } from '../../../../platform/database/transactions.js';
import { DomainEventPublisher } from '../../../../platform/outbox/domain-event-publisher.js';
import { Equipment } from '../../domain/equipment.js';
import { EquipmentRepository } from '../../domain/equipment.repository.js';
import { representEquipment } from '../equipment.representation.interface.js';
import { RegisterEquipmentCommand } from './register-equipment.command.js';

/** Registers equipment: creates it, saves it and stages its events in one transaction. */
@CommandHandler(RegisterEquipmentCommand)
export class RegisterEquipmentHandler implements ICommandHandler<RegisterEquipmentCommand> {
  constructor(
    private readonly equipmentRepository: EquipmentRepository,
    private readonly transactions: Transactions,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute({ serialNumber, type }: RegisterEquipmentCommand) {
    const equipment = Equipment.register(serialNumber, type, new Date());
    await this.transactions.run(async (tx) => {
      await this.equipmentRepository.save(tx, equipment);
      await this.events.publish(tx, equipment.pullDomainEvents());
    });
    return representEquipment(equipment);
  }
}
