import axios, { AxiosError } from "axios";
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
} from "./lib/accessToken";
import { clearAuth } from "./lib/auth";

// ------------------------
// Base client
// ------------------------
const BASE_URL = import.meta?.env?.VITE_API_BASE || "/api";

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

// ------------------------
// Auth: attach Bearer access token
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
// 401 interceptor → refresh
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
// Avatar
// ----------------------------------------------------
export async function updateAvatar(avatar: File) {
  const formData = new FormData();
  formData.append("avatar", avatar);

  return api.patch<{ ok: boolean; user: import("./lib/auth").PublicUser }>(
    "/auth/avatar",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
}

// ----------------------------------------------------
// Nickname (displayName + username slug)
// ----------------------------------------------------
export async function updateNickname(nickname: string) {
  return api.patch<{ ok: boolean; user: any }>("/auth/nickname", {
    nickname: nickname.trim(),
  });
}

// ----------------------------------------------------
// Change email (password -> new email -> verify code)
// ----------------------------------------------------
export async function changeEmailPasswordProof(password: string) {
  const { data } = await api.post<{ ok: boolean; proof?: string; error?: string }>(
    "/auth/change-email/proof",
    { password: password.trim() }
  );

  if (!data?.ok || !data.proof) {
    throw new Error(data?.error || "Password verification failed");
  }

  return data.proof;
}

export async function changeEmailStart(newEmail: string, proof: string) {
  const { data } = await api.post<{ ok: boolean; message?: string; error?: string }>(
    "/auth/change-email/start",
    { newEmail: newEmail.trim().toLowerCase(), proof }
  );

  if (!data?.ok) {
    throw new Error(data?.error || "Failed to send verification code");
  }

  return data;
}

export async function changeEmailVerify(newEmail: string, code: string) {
  const { data } = await api.post<{
    ok: boolean;
    user?: import("./lib/auth").PublicUser;
    error?: string;
  }>("/auth/change-email/verify", {
    newEmail: newEmail.trim().toLowerCase(),
    code: code.trim(),
  });

  if (!data?.ok || !data.user) {
    throw new Error(data?.error || "Email verification failed");
  }

  return data.user;
}

export async function logoutOtherDevices() {
  // keep current session, revoke others
  const { data } = await api.post("/auth/logout-others");
  if (!data?.ok) {
    throw new Error(data?.error || data?.message || "Failed to logout other devices.");
  }
  return data as { ok: true; revoked: number };
}

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
// Change password via email link (Settings)
// ----------------------------------------------------
export function requestChangePasswordLink() {
  return api.post<{ ok: boolean; message?: string; error?: string }>(
    "/auth/change-password/request",
    {}
  );
}

// ----------------------------------------------------
// Types
// ----------------------------------------------------
export interface ApiUserSummary {
  id: string;
  username: string; // slug for @mentions (no spaces, lowercase)
  displayName?: string | null; // nice nickname as entered by the user
  avatarUrl?: string | null;
}

// 🔥 Reaction types for posts
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

  // media
  mediaType?: "image" | "video" | null;
  mediaUrl?: string | null;
  mediaLocalPath?: string | null;

  // reactions (likesCount = total number of reactions)
  likesCount: number;
  likedByMe: boolean; // true if any reaction exists
  myReaction?: ReactionType | null;

  // comments
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

  // comment likes
  likesCount: number;
  likedByMe: boolean;

  isPinned: boolean;
}

export interface CommentsPage {
  comments: PostComment[];
  nextCursor: string | null;
}

// comment sort modes
export type CommentSortMode = "best" | "new" | "old";

// Follow stats
export interface FollowStatsResponse {
  ok: boolean;
  followers: number;
  following: number;
  isFollowing: boolean;
}

// 🆕 Type for hashtag suggestions
export interface HashtagSuggestion {
  id: string;
  tag: string; // without #, lowercase
}

export interface HashtagDto {
  id: string;
  tag: string; // without #
}

// ✅ Feed pagination response
export interface FeedPage {
  ok: boolean;
  posts: Post[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ✅ Feed scope for filter
export type FeedScope = "all" | "following";

// ----------------------------------------------------
// Posts
// ----------------------------------------------------

// Feed (cursor pagination: 5 + 5 + 5 ...) + scope (all / following)
export function fetchFeed(params?: {
  limit?: number;
  cursor?: string | null;
  scope?: FeedScope;
}) {
  return api.get<FeedPage>("/posts", {
    params: {
      limit: params?.limit ?? 5,
      cursor: params?.cursor ?? null,
      scope: params?.scope ?? "all",
    },
  });
}

// Posts of a specific user
export function fetchUserPosts(userId: string) {
  return api.get<{ ok: boolean; posts: Post[] }>(`/posts/user/${userId}`);
}

// Create a post (with text and optional file)
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

// 🆕 Add / change reaction on a post
export async function reactToPost(postId: string, type: ReactionType) {
  const { data } = await api.post<{
    ok: boolean;
    reactions: PostReactionsSummary;
  }>(`/posts/${postId}/react`, { type });

  return data.reactions;
}

// 🆕 Get reactions summary for a post
export async function fetchPostReactions(
  postId: string
): Promise<PostReactionsSummary> {
  const { data } = await api.get<{
    ok: boolean;
    reactions: PostReactionsSummary;
  }>(`/posts/${postId}/reactions`);

  return data.reactions;
}

// Like / Unlike (toggle) for a post — via LIKE reaction
export function toggleLike(postId: string) {
  return reactToPost(postId, "LIKE");
}

// 🆕 Delete a post (author only)
export async function deletePost(postId: string) {
  const { data } = await api.delete<{ ok: boolean; message?: string }>(
    `/posts/${postId}`
  );
  return data;
}

export async function updatePostCaption(postId: string, caption: string) {
  const { data } = await api.patch<{
    ok: boolean;
    post?: Post;
    message?: string;
  }>(`/posts/${postId}`, { caption });

  if (!data.ok) {
    throw new Error(data.message || "Failed to update caption");
  }
  return data;
}


// ----------------------------------------------------
// Comments + likes/pin/edit/delete
// ----------------------------------------------------

// Like / Unlike (toggle) for a comment
export function toggleCommentLike(commentId: string) {
  return api.post<{ ok: boolean; liked: boolean; likesCount: number }>(
    `/posts/comments/${commentId}/like`
  );
}

// Pin / unpin a comment (post author only)
export function togglePinComment(postId: string, commentId: string) {
  return api.post<{ ok: boolean; pinnedCommentId: string | null }>(
    `/posts/${postId}/comments/${commentId}/pin`
  );
}

// Get a page of comments with pagination and sorting
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

// Add a comment
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

// Edit own comment
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

// Delete own comment
export function deleteComment(commentId: string) {
  return api.delete<{ ok: boolean }>(`/posts/comments/${commentId}`);
}

// ----------------------------------------------------
// Follow system
// ----------------------------------------------------

// Get stats + follow status for userId
export function fetchFollowStats(userId: string) {
  return api.get<FollowStatsResponse>(`/follow/stats/${userId}`);
}

// Follow a user
export function followUser(userId: string) {
  return api.post<{ ok: boolean; action: "followed" }>(`/follow/${userId}`);
}

// Unfollow a user
export function unfollowUser(userId: string) {
  return api.delete<{ ok: boolean; action: "unfollowed" }>(`/follow/${userId}`);
}

// Get user followers list
export function fetchFollowers(userId: string) {
  return api.get<{ ok: boolean; users: ApiUserSummary[] }>(
    `/follow/followers/${userId}`
  );
}

// 🆕 Search users by username / displayName (for @mentions and search)
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

// 🆕 Search hashtags for autocomplete (#tag)
// NOTE: backend returns { ok, hashtags }, NOT an array.
export async function searchTags(query: string): Promise<HashtagSuggestion[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const { data } = await api.get<{
    ok: boolean;
    hashtags: HashtagDto[];
  }>("/tags/search", {
    params: { q },
  });

  if (!data?.ok) return [];
  return (data.hashtags ?? []).map((h) => ({ id: h.id, tag: h.tag }));
}

// 🆕 Search hashtags by prefix (for autocomplete)
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

// Get public user info by id
export function fetchUserPublic(userId: string) {
  return api.get<{ ok: boolean; user: ApiUserSummary }>(`/users/${userId}`);
}
