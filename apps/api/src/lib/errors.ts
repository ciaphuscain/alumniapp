import { ErrorCode } from '@alumni/shared';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const notFound = (what = 'Resource') =>
  new AppError(ErrorCode.NOT_FOUND, `${what} not found`);
export const forbidden = (msg = 'You are not allowed to do that') =>
  new AppError(ErrorCode.FORBIDDEN, msg);
export const conflict = (msg: string) => new AppError(ErrorCode.CONFLICT, msg);
export const unauthenticated = () => new AppError(ErrorCode.UNAUTHENTICATED, 'Sign in required');
