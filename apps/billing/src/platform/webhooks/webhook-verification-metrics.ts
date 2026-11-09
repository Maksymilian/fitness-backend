import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type Counter, metrics } from '@opentelemetry/api';
import { channel } from 'node:diagnostics_channel';

const VERIFICATION_FAILED = 'nestjs:webhooks:verification-failed';

/**
 * Counts the webhooks `@nestjs/webhooks` refused (`webhooks.verification_failures`, in Prometheus
 * `webhooks_verification_failures_total`), by receiver and reason, from its diagnostics channel: a
 * wrong signing secret, or someone posting to the route. The sender only ever gets a generic 401.
 */
@Injectable()
export class WebhookVerificationMetrics implements OnModuleInit, OnModuleDestroy {
  private readonly failures: Counter = metrics.getMeter('billing.webhooks').createCounter('webhooks.verification_failures', {
    unit: '{request}',
    description: 'Incoming webhooks refused by their signature check',
  });
  private readonly listener = (event: unknown) => {
    const { receiver, reason } = (event ?? {}) as { receiver?: string; reason?: string };
    this.failures.add(1, { 'webhook.receiver': receiver ?? 'unknown', reason: reason ?? 'unknown' });
  };

  onModuleInit(): void {
    channel(VERIFICATION_FAILED).subscribe(this.listener);
  }

  onModuleDestroy(): void {
    channel(VERIFICATION_FAILED).unsubscribe(this.listener);
  }
}
