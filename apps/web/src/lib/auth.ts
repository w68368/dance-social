// Храним только ПУБЛИЧНЫЕ данные пользователя (без токенов)
export type PublicUser = {
  id: string;
  email: string;
  username: string;
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

// синхронизация между вкладками
window.addEventListener("storage", (e) => {
  if (e.key === KEY) listeners.forEach((fn) => fn());
});
