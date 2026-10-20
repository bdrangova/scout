import type { z } from 'zod'

/**
 * An error the JSON error handler in `app.ts` turns into `{ error, reason? }` with the given
 * HTTP status. The store throws these so routes stay thin.
 */
export class HttpError extends Error {
  readonly status: number
  readonly reason: string | undefined

  constructor(status: number, message: string, reason?: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.reason = reason
  }
}

export function notFound(message: string): HttpError {
  return new HttpError(404, message)
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, message)
}

/** The request conflicts with what the store holds; `reason` is a machine-readable code. */
export function conflict(message: string, reason: string): HttpError {
  return new HttpError(409, message, reason)
}

/** A file in the store exists but does not match its schema. */
export function invalidStoreFile(message: string): HttpError {
  return new HttpError(422, message)
}

/** One line per issue: `path: message; path: message`. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.map(String).join('.') : '<root>'}: ${issue.message}`)
    .join('; ')
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
