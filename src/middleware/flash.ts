import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Bindings } from '../bindings';

export interface FlashMessage {
  type: 'success' | 'error' | 'warning';
  message: string;
}

/**
 * Set a flash message cookie. The message will be available on the next request.
 */
export function setFlash(
  c: Context<{ Bindings: Bindings }>,
  type: FlashMessage['type'],
  message: string,
): void {
  const value = JSON.stringify({ type, message });
  setCookie(c, 'herald_flash', value, {
    httpOnly: false,
    secure: true,
    sameSite: 'Lax',
    path: '/admin',
    maxAge: 60, // 1 minute expiry as safety net
  });
}

/**
 * Read and delete the flash message cookie. Returns null if no flash exists.
 */
export function getFlash(
  c: Context<{ Bindings: Bindings }>,
): FlashMessage | null {
  const raw = getCookie(c, 'herald_flash');
  if (!raw) return null;

  deleteCookie(c, 'herald_flash', { path: '/admin' });

  try {
    const parsed = JSON.parse(raw) as FlashMessage;
    if (parsed.type && parsed.message) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
