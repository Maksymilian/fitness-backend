import { TelemetryLogger } from '@app/telemetry';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Environment } from './platform/config/environment.js';
import { configureHttp } from './platform/http/configure-http.js';

async function bootstrap() {
  // rawBody: Stripe's events are verified on the bytes it signed, not on a re-serialized body.
  // Startup logs wait for the logger, which the validated configuration sets up.
  const app = configureHttp(await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true }));
  const config = app.get(ConfigService<Environment, true>);
  // Logs go to OpenTelemetry, with the trace and flow they belong to, and to the console unless LOG_CONSOLE=off.
  app.useLogger(new TelemetryLogger({ console: config.get('LOG_CONSOLE', { infer: true }) === 'on' }));
  // On SIGTERM: readiness turns 503, the outbox relay drains, then the pool and the broker close.
  app.enableShutdownHooks();
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
