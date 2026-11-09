import { Controller, VERSION_NEUTRAL, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { OutboxDeadLetters, OutboxRelay } from '@nestjs/outbox';
import { AdminGuard } from './admin.guard.js';

/**
 * Internal admin routes for the outbox: list, requeue and purge dead letters, and the relay's
 * stats. Dead letters hold full payloads, so the routes need the admin token.
 */
@Controller({ path: 'internal/admin/outbox', version: VERSION_NEUTRAL })
@UseGuards(AdminGuard)
export class OutboxAdminController {
  constructor(
    private readonly deadLetters: OutboxDeadLetters,
    private readonly relay: OutboxRelay,
  ) {}

  @Get('dead-letters')
  list(@Query('topic') topic?: string) {
    return this.deadLetters.list({ topic });
  }

  /** Back to the outbox with a fresh retry budget and the same id: consumers that had it skip it. */
  @Post('dead-letters/:id/requeue')
  @HttpCode(HttpStatus.OK)
  async requeue(@Param('id', ParseUUIDPipe) id: string) {
    return { requeued: await this.deadLetters.requeue(id) };
  }

  @Delete('dead-letters/:id')
  async purge(@Param('id', ParseUUIDPipe) id: string) {
    return { purged: await this.deadLetters.purge(id) };
  }

  @Get('stats')
  stats() {
    return this.relay.stats();
  }
}
