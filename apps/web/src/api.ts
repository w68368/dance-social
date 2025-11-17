import axios, { AxiosError } from "axios";
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
} from "./lib/accessToken";
import { clearAuth } from "./lib/auth"; // 👈 добавили

// ------------------------
// Базовый клиент
// ------------------------
const BASE_URL = import.meta?.env?.VITE_API_BASE || "/api";

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // важно: чтобы браузер слал refresh-cookie
});

// ------------------------
// Авторизация: ставим Bearer access
// ------------------------
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>)[
      "Authorization"
    ] = `Bearer ${token}`;
  }
  return config;
});

// ------------------------
// Перехватчик 401 → refresh
// ------------------------
let isRefreshing = false;
let waiting: Array<(token: string | null) => void> = [];

function onRefreshed(newToken: string | null) {
  waiting.forEach((cb) => cb(newToken));
  waiting = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError & { config: any }) => {
    const original = error.config || {};
    const status = error?.response?.status;

    // Не рефрешим /auth/refresh → иначе будет цикл
    const isRefreshCall =
      typeof original?.url === "string" &&
      original.url.replace(BASE_URL, "").includes("/auth/refresh");

    if (status === 401 && !original._retry && !isRefreshCall) {
      original._retry = true;

      // Если refresh уже выполняется — ждём его завершения
      if (isRefreshing) {
        return new Promise((resolve) => {
          waiting.push((token) => {
            if (token) {
              original.headers = original.headers ?? {};
              original.headers.Authorization = `Bearer ${token}`;
            }
            resolve(api(original));
          });
        });
      }

      isRefreshing = true;
      try {
        const { data } = await axios.post(
          `${BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        if (data?.ok && data?.accessToken) {
          // ✅ refresh успешен
          setAccessToken(data.accessToken);
          onRefreshed(data.accessToken);

          original.headers = original.headers ?? {};
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        } else {
          // ❌ refresh невалиден → полная очистка сессии
          clearAccessToken();
          clearAuth(); // 👈 выкидываем пользователя из состояния
          onRefreshed(null);
          return Promise.reject(error);
        }
      } catch (e) {
        // ❌ ошибка / 401 на /auth/refresh → тоже Logout
        clearAccessToken();
        clearAuth(); // 👈 важно
        onRefreshed(null);
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ----------------------------------------------------
// Forgot / Reset password
// ----------------------------------------------------
export function requestPasswordReset(email: string, captchaToken: string) {
  return api.post("/auth/forgot", {
    email: email.trim().toLowerCase(),
    captchaToken,
  });
}

export function submitPasswordReset(token: string, newPassword: string) {
  return api.post("/auth/reset", { token, newPassword });
}

// ----------------------------------------------------
// Types
// ----------------------------------------------------
export interface ApiUserSummary {
  id: string;
  username: string;
  avatarUrl?: string | null;
}

export interface Post {
  id: string;
  caption: string;
  createdAt: string;
  updatedAt?: string;
  author: ApiUserSummary;

  // медиа
  mediaType?: "image" | "video" | null;
  mediaUrl?: string | null;
  mediaLocalPath?: string | null;

  // 🆕 лайки
  likesCount: number;
  likedByMe?: boolean | null;
}

// ----------------------------------------------------
// Posts
// ----------------------------------------------------

// Лента
export function fetchFeed() {
  return api.get<{ ok: boolean; posts: Post[] }>("/posts");
}

// Создать пост (с текстом и файлом, если есть)
export function createPost(caption: string, media?: File | null) {
  const trimmed = caption.trim();

  if (media) {
    const formData = new FormData();
    formData.append("caption", trimmed);
    formData.append("media", media);

    return api.post<{ ok: boolean; post: Post }>("/posts", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }

  return api.post<{ ok: boolean; post: Post }>("/posts", { caption: trimmed });
}

// 🆕 Лайк / Unlike (toggle)
export function toggleLike(postId: string) {
  return api.post<{ ok: boolean; liked: boolean; likesCount: number }>(
    `/posts/${postId}/like`
  );
}
