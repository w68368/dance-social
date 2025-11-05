import axios from "axios";
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
} from "./lib/accessToken";

// ------------------------
// Базовый клиент
// ------------------------
export const api = axios.create({
  baseURL: "/api",
  withCredentials: true, // важно: чтобы браузер слал refresh-cookie
});

// ------------------------
// Авторизация: ставим Bearer access
// ------------------------
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${token}`;
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
  async (error) => {
    const original = error.config;

    // Если токен просрочен / нет доступа → пытаемся обновить
    if (error?.response?.status === 401 && !original._retry) {
      original._retry = true;

      // ---- Если уже идёт refresh — ждём результат
      if (isRefreshing) {
        return new Promise((resolve) => {
          waiting.push((token) => {
            if (token) {
              original.headers.Authorization = `Bearer ${token}`;
            }
            resolve(api(original));
          });
        });
      }

      // ---- Запускаем refresh
      isRefreshing = true;
      try {
        const { data } = await axios.post(
          "/api/auth/refresh",
          {},
          { withCredentials: true }
        );

        if (data?.ok && data?.accessToken) {
          setAccessToken(data.accessToken);

          onRefreshed(data.accessToken);

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
