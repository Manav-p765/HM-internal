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
  // The server refuses everything until the temporary password is changed.
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

export async function api<T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.', 'NETWORK_ERROR');
  }

  const data = await response.json().catch(() => null);

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
