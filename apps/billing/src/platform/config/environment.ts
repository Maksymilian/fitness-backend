import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Matches, Max, Min, MinLength, validateSync } from 'class-validator';

/** Billing's environment variables. The service doesn't start without valid ones. */
export class Environment {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3003;

  /** PostgreSQL instance 3, e.g. postgres://billing:billing@localhost:5435/billing */
  @IsString()
  @MinLength(1)
  DATABASE_URL: string;

  /** e.g. amqp://fitness:fitness@localhost:5672 */
  @IsString()
  @MinLength(1)
  RABBITMQ_URL: string;

  /** `off` in instances that only accept requests and leave publishing to other instances. */
  @IsIn(['on', 'off'])
  OUTBOX_RELAY: 'on' | 'off' = 'on';

  /**
   * `on` to limit callers in the service (section 16.1): locally, or wherever nothing in front of
   * the service limits them. Off by default: in AWS, a WAF rate-based rule limits them instead.
   */
  @IsIn(['on', 'off'])
  RATE_LIMIT: 'on' | 'off' = 'off';

  /** Requests one caller (an IP address) may send per minute; past it, 429 (section 16). Counted per instance. */
  @IsInt()
  @Min(1)
  RATE_LIMIT_PER_MINUTE: number = 600;

  /** How long a GET route may take before it's answered 504 (section 16). Its work isn't stopped. */
  @IsInt()
  @Min(1)
  QUERY_TIMEOUT_MS: number = 3000;

  /** `off` where logs only go to OpenTelemetry (production): nothing on stdout or stderr. */
  @IsIn(['on', 'off'])
  LOG_CONSOLE: 'on' | 'off' = 'on';

  /** The web apps that call the membership routes from a browser, comma-separated. Unset or empty, no other origin may. */
  @IsOptional()
  @Matches(/^(https?:\/\/[^\s,/]+(,https?:\/\/[^\s,/]+)*)?$/, { message: 'CORS_ORIGINS must be origins (scheme://host[:port]), comma-separated' })
  CORS_ORIGINS?: string;

  /** Protects the dead-letter admin routes. Without it, they answer 403. */
  @IsOptional()
  @IsString()
  @MinLength(16)
  ADMIN_TOKEN?: string;

  /**
   * The payment provider's secret key: a test key (`sk_test_...`, or a restricted `rk_test_...`) in
   * development. Unset or empty, checkouts and the billing portal answer 503; the webhook still works.
   */
  @IsOptional()
  @Matches(/^((sk|rk)_(test|live)_[A-Za-z0-9]+)?$/, { message: 'STRIPE_SECRET_KEY must be a Stripe secret key (sk_test_...)' })
  STRIPE_SECRET_KEY?: string;

  /**
   * The signing secret of Stripe's webhook (`whsec_...`): the Stripe CLI's in development, the
   * endpoint's in the Dashboard otherwise. Unset or empty, the webhook route doesn't exist.
   */
  @IsOptional()
  @Matches(/^(whsec_[A-Za-z0-9+/=_-]+)?$/, { message: 'STRIPE_WEBHOOK_SECRET must be a Stripe signing secret (whsec_...)' })
  STRIPE_WEBHOOK_SECRET?: string;

  /** Where Checkout and the Billing Portal send the member back: the member app's membership page. */
  @IsUrl({ require_tld: false, require_protocol: true })
  MEMBERSHIP_PAGE_URL: string = 'http://localhost:5173/membership';
}

export function validateEnvironment(config: Record<string, unknown>): Environment {
  const environment = plainToInstance(Environment, config, { enableImplicitConversion: true });
  const errors = validateSync(environment, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment:\n${errors.map((error) => `- ${Object.values(error.constraints ?? {}).join(', ')}`).join('\n')}`);
  }
  if (environment.NODE_ENV !== 'production' && environment.STRIPE_SECRET_KEY?.includes('_live_')) {
    throw new Error('Invalid environment:\n- STRIPE_SECRET_KEY is a live key outside production: use a test key');
  }
  return environment;
}
