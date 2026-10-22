import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ErrorCode } from '@alumni/shared';
import { AppError } from './errors.ts';

/** Validates untrusted input against a schema, raising a uniform VALIDATION error. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new AppError(ErrorCode.VALIDATION, 'Invalid request', z.flattenError(result.error));
  }
  return result.data;
}

export const IdParam = z.strictObject({ id: z.uuid() });
export const UserIdParam = z.strictObject({ userId: z.uuid() });

export function clientIp(req: FastifyRequest): string {
  return req.ip;
}
