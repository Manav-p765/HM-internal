// What may be logged about an unexpected error: its class and a short code (e.g. a Postgres SQLSTATE such as
// 23503, or ECONNREFUSED). Never the message, stack, detail or query: pg messages and details carry row
// values ("Key (email)=(...)", 'invalid input syntax for type uuid: "..."') and errors can carry parameters.
export function describeError(err: unknown): string {
  const name = err instanceof Error ? err.constructor.name : typeof err;
  const code = (err as { code?: unknown } | null)?.code;
  const safeCode = typeof code === 'string' && /^[A-Za-z0-9_./-]{1,40}$/.test(code) ? code : undefined;
  return safeCode ? `${name} code=${safeCode}` : name;
}
