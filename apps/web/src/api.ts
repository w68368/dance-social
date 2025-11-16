// apps/web/src/api.ts
import axios, { AxiosError } from "axios";
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
} from "./lib/accessToken";

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

    // Не рефрешим для самого /auth/refresh, чтобы не зациклиться
    const isRefreshCall =
      typeof original?.url === "string" &&
      original.url.replace(BASE_URL, "").includes("/auth/refresh");

    if (status === 401 && !original._retry && !isRefreshCall) {
      original._retry = true;

      // Если уже идёт refresh — ждём
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

      // Запускаем refresh
      isRefreshing = true;
      try {
        const { data } = await axios.post(
          `${BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        if (data?.ok && data?.accessToken) {
          setAccessToken(data.accessToken);
          onRefreshed(data.accessToken);

          original.headers = original.headers ?? {};
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        } else {
          clearAccessToken();
          onRefreshed(null);
          throw error;
        }
      } catch (e) {
        clearAccessToken();
        onRefreshed(null);
        throw e;
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ----------------------------------------------------
// Helper API calls for Forgot / Reset password
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
