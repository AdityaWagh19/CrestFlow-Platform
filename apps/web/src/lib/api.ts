import type { ApiResponse, ApiError } from '@crestflow/shared';

const API_BASE = '/api/v1';

/**
 * Base fetch wrapper for CrestFlow API.
 * Attaches Authorization header from stored token.
 * Returns typed ApiResponse<T>.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const token = getStoredToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.headers) {
    const incoming = options.headers as Record<string, string>;
    for (const [key, value] of Object.entries(incoming)) {
      headers[key] = value;
    }
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // Handle 401 — expired/invalid JWT -> redirect to login
  if (response.status === 401) {
    clearStoredToken();
    window.location.href = '/';
    throw new Error('Session expired');
  }

  const body: unknown = await response.json();

  if (!response.ok) {
    const error = body as ApiError;
    throw new ApiRequestError(
      error.error?.message ?? 'Request failed',
      response.status,
      error.error?.code ?? 'UNKNOWN',
      body,
    );
  }

  return body as ApiResponse<T>;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

// Simple token storage — will be replaced with Zustand store
function getStoredToken(): string | null {
  try {
    return localStorage.getItem('crestflow_token');
  } catch {
    return null;
  }
}

function clearStoredToken(): void {
  try {
    localStorage.removeItem('crestflow_token');
  } catch {
    // SSR or restricted access
  }
}
