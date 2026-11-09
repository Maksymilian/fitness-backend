import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Environment } from '../config/environment.js';

type HttpRequest = { headers: Record<string, string | string[] | undefined> };

/**
 * Placeholder until authentication exists: the internal admin routes need the `x-admin-token`
 * header to match `ADMIN_TOKEN`. Without `ADMIN_TOKEN`, they are closed.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const token = this.config.get('ADMIN_TOKEN', { infer: true });
    const given = context.switchToHttp().getRequest<HttpRequest>().headers['x-admin-token'];
    return !!token && typeof given === 'string' && sameSecret(given, token);
  }
}

/** Compares in constant time, so response times don't give the token away. */
function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}
