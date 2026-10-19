// Thin fetch wrapper for the Express API. Same-origin in production; in dev Vite proxies /api.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface SessionHandlers {
  // The server no longer recognises our session (expired, signed out elsewhere, account disabled).
  onUnauthenticated: () => void;
  // The server refuses everything until a (pre-invite-link) temporary password is changed.
  onPasswordChangeRequired: () => void;
}

let handlers: SessionHandlers | null = null;

// Registered once by AuthProvider so any API call can update the session state.
export function setSessionHandlers(next: SessionHandlers | null): void {
  handlers = next;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
}

// Safety net so a form never spins forever: the server gives up well before this (mail after 10 s, SQL
// statements after 15 s), so only a hung connection or proxy ever reaches it.
const REQUEST_TIMEOUT_MS = 30_000;

export async function api<T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response: Response;
  let data: { error?: string; code?: string; details?: { path: string; message: string }[] } | null;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    data = await response.json().catch(() => null);
  } catch {
    if (signal.aborted) {
      throw new ApiError(0, 'The server took too long to answer. Check whether the change was saved before trying again.', 'TIMEOUT');
    }
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.', 'NETWORK_ERROR');
  }

  if (!response.ok) {
    const error = new ApiError(
      response.status,
      data?.error ?? `Request failed (${response.status})`,
      data?.code,
      data?.details,
    );
    if (response.status === 401 && error.code === 'UNAUTHENTICATED') handlers?.onUnauthenticated();
    if (response.status === 403 && error.code === 'PASSWORD_CHANGE_REQUIRED') handlers?.onPasswordChangeRequired();
    throw error;
  }

  return data as T;
}

// For showing a caught error to the user.
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}
