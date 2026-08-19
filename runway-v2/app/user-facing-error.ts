const INTERNAL_ERROR = /(sqlstate|postgres|postgrest|pgrst\d|relation |column |constraint |violates |row-level security|permission denied|schema cache|duplicate key|function public\.)/i;

export function userFacingError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  if (!message || message.length > 240 || INTERNAL_ERROR.test(message)) return fallback;
  return message;
}
