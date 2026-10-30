/**
 * Client HTTP de l'API. En développement, Vite proxifie /api vers
 * http://localhost:4000 ; en production, VITE_API_BASE_URL est l'URL absolue.
 */
const AUTH_KEY = 'mbf.auth';
export function getAuth() {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export function setAuth(session) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(session));
}
export function clearAuth() {
    localStorage.removeItem(AUTH_KEY);
}
export class ApiError extends Error {
    constructor(status, body) {
        super(`API ${status}`);
        Object.defineProperty(this, "status", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: status
        });
        Object.defineProperty(this, "body", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: body
        });
        this.name = 'ApiError';
    }
}
function baseUrl() {
    const fromEnv = import.meta.env?.VITE_API_BASE_URL ?? '';
    return fromEnv.replace(/\/$/, '');
}
export async function apiFetch(path, options = {}) {
    const session = getAuth();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.token)
        headers.Authorization = `Bearer ${session.token}`;
    const res = await fetch(`${baseUrl()}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
    });
    if (!res.ok) {
        let body = null;
        try {
            body = await res.json();
        }
        catch {
            body = null;
        }
        throw new ApiError(res.status, body);
    }
    return (await res.json());
}
export function isOfflineError(error) {
    return error instanceof TypeError || (error instanceof ApiError && error.status === 0);
}
