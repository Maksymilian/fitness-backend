import { ConcurrencyConflict, DomainError } from '@app/ddd';
import { Controller, HttpCode, HttpStatus, Logger, Post, UnprocessableEntityException } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { SkipThrottle } from '@nestjs/throttler';
import { VerifyWebhook, WebhookPayload } from '@nestjs/webhooks';
import { type Counter, metrics } from '@opentelemetry/api';
import type Stripe from 'stripe';
import { LedgerEntryAlreadyRecorded } from '../ledger/domain/errors/ledger-entry-already-recorded.js';
import { InvalidStripeEvent } from './invalid-stripe-event.js';
import { ProviderCustomers } from './provider-customers.js';
import { StripeEventTranslator } from './stripe-event.translator.js';

/**
 * Where Stripe posts its events (the Stripe CLI in development), outside the versioned API.
 * `@VerifyWebhook('stripe')` checks the `Stripe-Signature` header on the raw body before anything
 * runs; each command then commits with its inbox record (`webhooks:stripe`), so a resent event
 * changes nothing. A 2xx tells Stripe it's done; anything else, and Stripe sends it again (for 3
 * days). No rate limit: every event comes from Stripe's few addresses.
 */
@SkipThrottle()
@Controller('stripe')
export class StripeEventsController {
  private readonly logger = new Logger(StripeEventsController.name);
  // Created with the controller, after the OpenTelemetry SDK started (instrumentation.ts).
  private readonly received: Counter = metrics.getMeter('billing.stripe-acl').createCounter('billing.stripe_events', {
    unit: '{event}',
    description: "Stripe's events received, by type and outcome: applied, ignored, duplicate, failed",
  });

  constructor(
    private readonly commandBus: CommandBus,
    private readonly translator: StripeEventTranslator,
    private readonly customers: ProviderCustomers,
  ) {}

  @Post('events')
  @HttpCode(HttpStatus.OK)
  @VerifyWebhook('stripe')
  async receive(@WebhookPayload() event: Stripe.Event): Promise<void> {
    const type = typeof event?.type === 'string' ? event.type : 'unknown';
    try {
      const translation = await this.translator.translate(event);
      if ('ignored' in translation) {
        this.count(type, 'ignored');
        this.logger.debug(`Ignoring ${type} ${event.id}: ${translation.ignored}`);
        return;
      }
      if (translation.customer) {
        await this.customers.record(translation.customer.memberId, translation.customer.customerReference);
      }
      let duplicate = true;
      for (const command of translation.commands) {
        const outcome = await this.commandBus.execute(command);
        duplicate &&= outcome.duplicate;
      }
      this.count(type, duplicate ? 'duplicate' : 'applied');
    } catch (error) {
      if (error instanceof LedgerEntryAlreadyRecorded) {
        // Stripe sent the same payment or refund in another event: it's in the ledger already.
        this.count(type, 'duplicate');
        return;
      }
      this.count(type, 'failed');
      if (error instanceof InvalidStripeEvent) {
        this.logger.error(`${error.message} (event ${event?.id}): Stripe sends it again, but it will fail again; see the Dashboard`);
        throw new UnprocessableEntityException(error.message);
      }
      if (error instanceof DomainError || error instanceof ConcurrencyConflict) {
        this.logger.warn(`Stripe sends ${type} ${event?.id} again: ${(error as Error).message}`);
      }
      throw error;
    }
  }

  private count(type: string, outcome: 'applied' | 'ignored' | 'duplicate' | 'failed'): void {
    this.received.add(1, { 'stripe.event_type': type, outcome });
  }
}
