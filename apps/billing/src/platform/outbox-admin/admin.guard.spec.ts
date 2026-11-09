import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AdminGuard } from './admin.guard.js';

function guard(adminToken: string | undefined) {
  return new AdminGuard({ get: () => adminToken } as unknown as ConfigService);
}

function request(token?: string): ExecutionContext {
  const headers = token === undefined ? {} : { 'x-admin-token': token };
  return { switchToHttp: () => ({ getRequest: () => ({ headers }) }) } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  it('lets the right token through', () => {
    expect(guard('a-long-admin-token').canActivate(request('a-long-admin-token'))).toBe(true);
  });

  it('refuses a wrong or missing token', () => {
    expect(guard('a-long-admin-token').canActivate(request('wrong'))).toBe(false);
    expect(guard('a-long-admin-token').canActivate(request())).toBe(false);
  });

  it('stays closed without ADMIN_TOKEN', () => {
    expect(guard(undefined).canActivate(request(''))).toBe(false);
  });
});
