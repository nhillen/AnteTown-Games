/**
 * Get the backend URL based on environment
 *
 * - In development: Use VITE_BACKEND_URL or http://localhost:3001
 * - In production: Use same origin (empty string) since frontend is served by backend
 */
export function getBackendUrl(): string {
  // Allow explicit override via env var
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL
  }

  // In development (vite dev server), connect to backend on port 3001
  if (import.meta.env.DEV) {
    return 'http://localhost:3001'
  }

  // In production, frontend is served by backend, so use same origin
  // This prevents CORS issues and works regardless of domain
  return ''
}
