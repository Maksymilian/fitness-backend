import { DomainError, type DomainErrorKind } from '@app/ddd';
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

const STATUS: Record<DomainErrorKind, HttpStatus> = {
  'not-found': HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  'invariant-violation': HttpStatus.UNPROCESSABLE_ENTITY,
};

/** Reports a broken business rule as `404`, `409` or `422`, with the domain error's name as `code`. */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const statusCode = STATUS[error.kind];
    response.status(statusCode).json({ statusCode, code: error.name, message: error.message });
  }
}
