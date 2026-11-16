import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhooksModule } from '@nestjs/webhooks';
import type { Environment } from '../../config/environment.js';
import { TelegramSecretTokenScheme } from './telegram-secret-token-scheme.js';
import { TelegramWebhookController } from './telegram-webhook.controller.js';

/**
 * Receives the bot's updates from Telegram, with `@nestjs/webhooks`: receive-only, so no store of
 * its own; its deduplication uses the outbox's inbox (consumer `webhooks:telegram`).
 */
@Module({
  imports: [
    WebhooksModule.forRootAsync({
      outgoing: false,
      isGlobal: false,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => ({
        receivers: {
          // Imported only with TELEGRAM_UPDATES=webhook, where validateEnvironment() requires the secret.
          telegram: { scheme: new TelegramSecretTokenScheme(), secret: config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true })! },
        },
      }),
    }),
  ],
  controllers: [TelegramWebhookController],
})
export class TelegramWebhookModule {}
