import { Module } from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';
import { OutboxAdminController } from './outbox-admin.controller.js';

@Module({
  controllers: [OutboxAdminController],
  providers: [AdminGuard],
})
export class OutboxAdminModule {}
