import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength, validateSync } from 'class-validator';

/** Workout Tracking's environment variables. The service doesn't start without valid ones. */
export class Environment {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3001;

  /** PostgreSQL instance 1, e.g. postgres://workout_tracking:workout_tracking@localhost:5433/workout_tracking */
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

  /** Protects the dead-letter admin routes. Without it, they answer 403. */
  @IsOptional()
  @IsString()
  @MinLength(16)
  ADMIN_TOKEN?: string;
}

/** Validates the environment at startup (`ConfigModule`'s `validate`), and fails fast with every problem listed. */
export function validateEnvironment(config: Record<string, unknown>): Environment {
  const environment = plainToInstance(Environment, config, { enableImplicitConversion: true });
  const errors = validateSync(environment, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment:\n${errors.map((error) => `- ${Object.values(error.constraints ?? {}).join(', ')}`).join('\n')}`);
  }
  return environment;
}
