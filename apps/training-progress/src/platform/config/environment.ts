import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Matches, Max, Min, MinLength, validateSync } from 'class-validator';

/** Training Progress' environment variables. The service doesn't start without valid ones. */
export class Environment {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3002;

  /** PostgreSQL instance 2, e.g. postgres://training_progress:training_progress@localhost:5434/training_progress */
  @IsString()
  @MinLength(1)
  DATABASE_URL: string;

  /** e.g. redis://localhost:6379 */
  @IsString()
  @MinLength(1)
  REDIS_URL: string;

  /** e.g. amqp://fitness:fitness@localhost:5672 */
  @IsString()
  @MinLength(1)
  RABBITMQ_URL: string;

  /** `off` in instances that leave the outbox's local handlers to other instances. */
  @IsIn(['on', 'off'])
  OUTBOX_RELAY: 'on' | 'off' = 'on';

  /** `off` reads the read models from PostgreSQL every time, without Redis (section 8.1): to compare, in load tests. */
  @IsIn(['on', 'off'])
  READ_CACHE: 'on' | 'off' = 'on';

  /**
   * `on`: on a miss, one caller per key loads the read model, under the key's load lock in Redis;
   * the others wait for its value (section 8.1). `off` lets every caller that misses load it: a
   * cache stampede, to compare.
   */
  @IsIn(['on', 'off'])
  READ_CACHE_LOCK: 'on' | 'off' = 'on';

  /**
   * `on` to limit callers in the service (section 16.1): locally, or wherever nothing in front of
   * the service limits them. Off by default: in AWS, a WAF rate-based rule limits them instead.
   */
  @IsIn(['on', 'off'])
  RATE_LIMIT: 'on' | 'off' = 'off';

  /** Requests one caller (an IP address) may send per minute; past it, 429 or TOO_MANY_REQUESTS (section 16). Counted per instance. */
  @IsInt()
  @Min(1)
  RATE_LIMIT_PER_MINUTE: number = 600;

  /** How long a GraphQL query field may take before it fails with TIMEOUT (section 16). Its work isn't stopped. */
  @IsInt()
  @Min(1)
  QUERY_TIMEOUT_MS: number = 3000;

  /** `off` where logs only go to OpenTelemetry (production): nothing on stdout or stderr. */
  @IsIn(['on', 'off'])
  LOG_CONSOLE: 'on' | 'off' = 'on';

  /**
   * The origins of the web apps that call GraphQL from a browser, comma-separated
   * (`https://app.fitness.example,http://localhost:5173`). Unset or empty, no other origin may.
   */
  @IsOptional()
  @Matches(/^(https?:\/\/[^\s,/]+(,https?:\/\/[^\s,/]+)*)?$/, { message: 'CORS_ORIGINS must be origins (scheme://host[:port]), comma-separated' })
  CORS_ORIGINS?: string;

  /** Protects the dead-letter admin routes. Without it, they answer 403. */
  @IsOptional()
  @IsString()
  @MinLength(16)
  ADMIN_TOKEN?: string;

  /** `file` (development: .eml files in MAIL_DIRECTORY), `smtp` or `resend`. */
  @IsIn(['file', 'smtp', 'resend'])
  MAIL_TRANSPORT: 'file' | 'smtp' | 'resend' = 'file';

  @IsString()
  MAIL_DIRECTORY: string = 'var/mail';

  @IsString()
  MAIL_FROM: string = 'Fitness Platform <progress@fitness.example>';

  /** Required with MAIL_TRANSPORT=smtp, e.g. smtp://user:password@smtp.example.com:587 */
  @IsOptional()
  @IsString()
  SMTP_URL?: string;

  /** Required with MAIL_TRANSPORT=resend. */
  @IsOptional()
  @IsString()
  RESEND_API_KEY?: string;

  /** From @BotFather. Unset or empty, the Telegram bot is off. */
  @IsOptional()
  @IsString()
  TELEGRAM_BOT_TOKEN?: string;

  /**
   * How Telegram's updates arrive: `polling` (development: one instance asks Telegram for them) or
   * `webhook` (production: Telegram posts them to TELEGRAM_WEBHOOK_URL, to any instance).
   */
  @IsIn(['polling', 'webhook'])
  TELEGRAM_UPDATES: 'polling' | 'webhook' = 'polling';

  /** Required with TELEGRAM_UPDATES=webhook: the public HTTPS URL of `POST /telegram/updates`. */
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: false })
  TELEGRAM_WEBHOOK_URL?: string;

  /** Required with TELEGRAM_UPDATES=webhook: Telegram sends it back in every update's header. */
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{32,256}$/, { message: 'TELEGRAM_WEBHOOK_SECRET must be 32 to 256 letters, digits, _ or -' })
  TELEGRAM_WEBHOOK_SECRET?: string;
}

export function validateEnvironment(config: Record<string, unknown>): Environment {
  const environment = plainToInstance(Environment, config, { enableImplicitConversion: true });
  const errors = validateSync(environment, { skipMissingProperties: false });
  if (environment.MAIL_TRANSPORT === 'smtp' && !environment.SMTP_URL) {
    throw new Error('Invalid environment:\n- SMTP_URL is required when MAIL_TRANSPORT is smtp');
  }
  if (environment.MAIL_TRANSPORT === 'resend' && !environment.RESEND_API_KEY) {
    throw new Error('Invalid environment:\n- RESEND_API_KEY is required when MAIL_TRANSPORT is resend');
  }
  if (environment.TELEGRAM_BOT_TOKEN && environment.TELEGRAM_UPDATES === 'webhook') {
    if (!environment.TELEGRAM_WEBHOOK_URL || !environment.TELEGRAM_WEBHOOK_SECRET) {
      throw new Error('Invalid environment:\n- TELEGRAM_WEBHOOK_URL and TELEGRAM_WEBHOOK_SECRET are required when TELEGRAM_UPDATES is webhook');
    }
  }
  if (errors.length > 0) {
    throw new Error(`Invalid environment:\n${errors.map((error) => `- ${Object.values(error.constraints ?? {}).join(', ')}`).join('\n')}`);
  }
  return environment;
}
