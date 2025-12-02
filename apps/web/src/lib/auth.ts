// apps/web/src/lib/auth.ts

// Store only PUBLIC user data (no tokens)
export type PublicUser = {
  id: string;
  email: string;
  username: string; // slug used for @mentions
  displayName?: string | null; // formatted nickname as written by the user
  avatarUrl?: string | null;
  createdAt: string;
};

const KEY = "user";

let listeners: Array<() => void> = [];

export function getUser(): PublicUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PublicUser) : null;
  } catch {
    return null;
  }
}

export function setUser(user: PublicUser | null) {
  try {
    if (user) localStorage.setItem(KEY, JSON.stringify(user));
    else localStorage.removeItem(KEY);
  } finally {
    listeners.forEach((fn) => fn());
  }
}

export function clearAuth() {
  setUser(null);
}

export function onAuthChange(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((x) => x !== cb);
  };
}

// sync between browser tabs
window.addEventListener("storage", (e) => {
  if (e.key === KEY) listeners.forEach((fn) => fn());
});
