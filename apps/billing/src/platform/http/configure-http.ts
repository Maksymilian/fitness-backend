import { FlowMiddleware, InterfaceMiddleware } from '@app/telemetry';
import { type INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment.js';

/**
 * The membership and ledger routes live under `/v1/...` (URI versioning); the admin routes under
 * `/internal/admin`, health routes at `/health/...`, and Stripe's webhook at `/stripe/events`, all
 * version neutral. Every response carries the security headers (Helmet 8's defaults), and the web
 * apps in CORS_ORIGINS may call the API from a browser. Every request runs in its flow and its
 * interface: `stripe` (the webhook) or `rest`. Used by `main.ts` and the e2e tests.
 */
export function configureHttp(app: INestApplication): INestApplication {
  const config = app.get<ConfigService<Environment, true>>(ConfigService);
  // First, so that every response has them, those of the middleware below included.
  app.useSecurityHeaders();
  const origins = (config.get('CORS_ORIGINS', { infer: true }) ?? '').split(',').filter(Boolean);
  if (origins.length > 0) {
    // Express' cors middleware. No cookies: a member is chosen by id until Identity exists.
    app.enableCors({
      origin: origins,
      methods: ['GET', 'POST'],
      exposedHeaders: ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
      maxAge: 600,
    });
  }
  const flow = new FlowMiddleware();
  app.use(flow.use.bind(flow));
  for (const [path, middleware] of [
    ['/stripe', new InterfaceMiddleware('stripe')],
    ['/', new InterfaceMiddleware('rest')],
  ] as const) {
    app.use(path, middleware.use.bind(middleware));
  }
  app.enableVersioning({ type: VersioningType.URI });
  return app;
}
