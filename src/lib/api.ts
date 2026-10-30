/**
 * Client HTTP de l'API. En développement, Vite proxifie /api vers
 * http://localhost:4000 ; en production, VITE_API_BASE_URL est l'URL absolue.
 */

const AUTH_KEY = 'mbf.auth';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  familyId: string | null;
  role: 'admin' | 'manager' | 'member' | 'readonly';
  preferredLanguage: 'fr' | 'en';
}

export interface Session {
  token: string;
  user: AuthUser;
}

export function getAuth(): Session | null {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setAuth(session: Session): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_KEY);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API ${status}`);
    this.name = 'ApiError';
  }
}

function baseUrl(): string {
  const fromEnv = (import.meta.env?.VITE_API_BASE_URL as string | undefined) ?? '';
  return fromEnv.replace(/\/$/, '');
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const session = getAuth();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;

  const res = await fetch(`${baseUrl()}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    throw new ApiError(res.status, body);
  }

  return (await res.json()) as T;
}

export function isOfflineError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof ApiError && error.status === 0);
}
