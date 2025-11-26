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

    const isRefreshCall =
      typeof original?.url === "string" &&
      original.url.replace(BASE_URL, "").includes("/auth/refresh");

    if (status === 401 && !original._retry && !isRefreshCall) {
      original._retry = true;

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
          setAccessToken(data.accessToken);
          onRefreshed(data.accessToken);

          original.headers = original.headers ?? {};
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        } else {
          clearAccessToken();
          clearAuth();
          onRefreshed(null);
          return Promise.reject(error);
        }
      } catch (e) {
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

// 🔥 Типы реакций на пост
export type ReactionType = "LIKE" | "FIRE" | "WOW" | "CUTE" | "CLAP";

export interface PostReactionsSummary {
  postId: string;
  counts: Record<ReactionType, number>;
  myReaction: ReactionType | null;
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

  // реакции (likesCount = общее число реакций)
  likesCount: number;
  likedByMe: boolean; // true, если есть любая реакция
  myReaction?: ReactionType | null;

  // комментарии
  commentsCount: number;
}

export interface PostComment {
  id: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
  postId: string;
  author: ApiUserSummary;
  parentId?: string | null;

  // лайки комментариев
  likesCount: number;
  likedByMe: boolean;

  isPinned: boolean;
}

export interface CommentsPage {
  comments: PostComment[];
  nextCursor: string | null;
}

// режимы сортировки комментариев
export type CommentSortMode = "best" | "new" | "old";

// Статистика подписок
export interface FollowStatsResponse {
  ok: boolean;
  followers: number;
  following: number;
  isFollowing: boolean;
}

// 🆕 Тип для подсказок хэштегов
export interface HashtagSuggestion {
  id: string;
  tag: string; // без #, в нижнем регистре
}

export interface HashtagDto {
  id: string;
  tag: string; // без #
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

// 🆕 Поставить / изменить реакцию на пост
export async function reactToPost(postId: string, type: ReactionType) {
  const { data } = await api.post<{
    ok: boolean;
    reactions: PostReactionsSummary;
  }>(`/posts/${postId}/react`, { type });

  return data.reactions;
}

// 🆕 Получить сводку реакций по посту
export async function fetchPostReactions(
  postId: string
): Promise<PostReactionsSummary> {
  const { data } = await api.get<{
    ok: boolean;
    reactions: PostReactionsSummary;
  }>(`/posts/${postId}/reactions`);

  return data.reactions;
}

// Лайк / Unlike (toggle) поста — через реакцию LIKE
export function toggleLike(postId: string) {
  return reactToPost(postId, "LIKE");
}

// ----------------------------------------------------
// Comments + likes/pin/edit/delete
// ----------------------------------------------------

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

// Получить страницу комментариев с пагинацией и сортировкой
export async function fetchComments(
  postId: string,
  cursor?: string | null,
  limit = 20,
  sort: CommentSortMode = "best"
): Promise<CommentsPage> {
  const params: Record<string, string | number> = {
    limit,
    sort,
  };
  if (cursor) params.cursor = cursor;

  const { data } = await api.get<{
    ok: boolean;
    comments: PostComment[];
    nextCursor: string | null;
  }>(`/posts/${postId}/comments`, {
    params,
  });

  return {
    comments: data.comments ?? [],
    nextCursor: data.nextCursor ?? null,
  };
}

// Добавить комментарий
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

// Редактировать свой комментарий
export async function editComment(
  commentId: string,
  text: string
): Promise<PostComment> {
  const { data } = await api.patch<{ ok: boolean; comment: PostComment }>(
    `/posts/comments/${commentId}`,
    { text: text.trim() }
  );
  return data.comment;
}

// Удалить свой комментарий
export function deleteComment(commentId: string) {
  return api.delete<{ ok: boolean }>(`/posts/comments/${commentId}`);
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

// 🆕 поиск пользователей по username / displayName (для @упоминаний и поиска)
export async function searchUsers(query: string): Promise<ApiUserSummary[]> {
  const q = query.trim();
  if (!q) return [];

  const { data } = await api.get<{
    ok: boolean;
    users: ApiUserSummary[];
  }>("/users/search", {
    params: { q },
  });

  if (!data?.ok) return [];
  return data.users ?? [];
}

// 🆕 поиск хэштегов для автодополнения (#tag)
export async function searchTags(query: string): Promise<HashtagSuggestion[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const { data } = await api.get<HashtagSuggestion[]>("/tags/search", {
    params: { q },
  });

  return data ?? [];
}

// 🆕 поиск хэштегов по префиксу (для автодополнения)
export async function searchHashtags(query: string): Promise<HashtagDto[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const { data } = await api.get<{
    ok: boolean;
    hashtags: HashtagDto[];
  }>("/tags/search", {
    params: { q },
  });

  if (!data?.ok) return [];
  return data.hashtags ?? [];
}

// получить публичную инфу пользователя по id
export function fetchUserPublic(userId: string) {
  return api.get<{ ok: boolean; user: ApiUserSummary }>(`/users/${userId}`);
}
