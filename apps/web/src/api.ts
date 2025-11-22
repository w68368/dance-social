import axios, { AxiosError } from "axios";
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
} from "./lib/accessToken";
import { clearAuth } from "./lib/auth";

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
          clearAuth();
          onRefreshed(null);
          return Promise.reject(error);
        }
      } catch (e) {
        // ❌ ошибка / 401 на /auth/refresh → тоже Logout
        clearAccessToken();
        clearAuth();
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
  username: string; // slug для @упоминаний (без пробелов, lowercase)
  displayName?: string | null; // красивый ник, как ввёл пользователь
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

  // лайки
  likesCount: number;
  likedByMe: boolean;

  // комментарии
  commentsCount: number;
}

export interface PostComment {
  id: string;
  text: string;
  createdAt: string;
  author: ApiUserSummary;
  parentId?: string | null;

  // лайки комментариев
  likesCount: number;
  likedByMe: boolean;

  isPinned: boolean;
}

// Статистика подписок
export interface FollowStatsResponse {
  ok: boolean;
  followers: number;
  following: number;
  isFollowing: boolean;
}

// ----------------------------------------------------
// Posts
// ----------------------------------------------------

// Лента
export function fetchFeed() {
  return api.get<{ ok: boolean; posts: Post[] }>("/posts");
}

// Посты конкретного пользователя
export function fetchUserPosts(userId: string) {
  return api.get<{ ok: boolean; posts: Post[] }>(`/posts/user/${userId}`);
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

// Лайк / Unlike (toggle) поста
export function toggleLike(postId: string) {
  return api.post<{ ok: boolean; liked: boolean; likesCount: number }>(
    `/posts/${postId}/like`
  );
}

// Лайк / Unlike (toggle) комментария
export function toggleCommentLike(commentId: string) {
  return api.post<{ ok: boolean; liked: boolean; likesCount: number }>(
    `/posts/comments/${commentId}/like`
  );
}

// Закрепить / открепить комментарий (только автор поста)
export function togglePinComment(postId: string, commentId: string) {
  return api.post<{ ok: boolean; pinnedCommentId: string | null }>(
    `/posts/${postId}/comments/${commentId}/pin`
  );
}

// ----------------------------------------------------
// Comments
// ----------------------------------------------------
export async function fetchComments(postId: string): Promise<PostComment[]> {
  const { data } = await api.get<{ ok: boolean; comments: PostComment[] }>(
    `/posts/${postId}/comments`
  );
  return data.comments ?? [];
}

export async function addComment(
  postId: string,
  text: string,
  parentId?: string
): Promise<PostComment> {
  const payload: { text: string; parentId?: string } = { text };
  if (parentId) payload.parentId = parentId;

  const { data } = await api.post<{ ok: boolean; comment: PostComment }>(
    `/posts/${postId}/comments`,
    payload
  );
  return data.comment;
}

// ----------------------------------------------------
// Follow system
// ----------------------------------------------------

// получить статистику + статус подписки на userId
export function fetchFollowStats(userId: string) {
  return api.get<FollowStatsResponse>(`/follow/stats/${userId}`);
}

// подписаться на пользователя
export function followUser(userId: string) {
  return api.post<{ ok: boolean; action: "followed" }>(`/follow/${userId}`);
}

// отписаться от пользователя
export function unfollowUser(userId: string) {
  return api.delete<{ ok: boolean; action: "unfollowed" }>(`/follow/${userId}`);
}

// список фолловеров пользователя
export function fetchFollowers(userId: string) {
  return api.get<{ ok: boolean; users: ApiUserSummary[] }>(
    `/follow/followers/${userId}`
  );
}

// получить публичную инфу пользователя по id
export function fetchUserPublic(userId: string) {
  return api.get<{ ok: boolean; user: ApiUserSummary }>(`/users/${userId}`);
}
