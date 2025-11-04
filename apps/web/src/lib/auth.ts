// Simple helper for storing auth state locally
export type AuthUser = {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string | null;
  gender?: string | null;
  createdAt?: string;
};

const TOKEN_KEY = "token";
const USER_KEY = "user";

// Custom event for Header and others to subscribe to changes
const AUTH_EVENT = "stepunity:authchange";

export function setAuth(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  try {
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function onAuthChange(listener: () => void) {
  const handler = () => listener();
  window.addEventListener(AUTH_EVENT, handler);
  const storageHandler = (e: StorageEvent) => {
    if (e.key === TOKEN_KEY || e.key === USER_KEY) listener();
  };
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(AUTH_EVENT, handler);
    window.removeEventListener("storage", storageHandler);
  };
}
