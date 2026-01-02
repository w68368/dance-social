// apps/web/src/api.ts
import axios, { AxiosError, type AxiosRequestConfig } from "axios";
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
    (config.headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// ------------------------
// 401 interceptor → refresh
// ------------------------
type RetriableConfig = AxiosRequestConfig & { _retry?: boolean };

let isRefreshing = false;
let waiting: Array<(token: string | null) => void> = [];

function onRefreshed(newToken: string | null) {
  waiting.forEach((cb) => cb(newToken));
  waiting = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError & { config: RetriableConfig }) => {
    const original = (error.config || {}) as RetriableConfig;
    const status = error?.response?.status;

    const url = typeof original?.url === "string" ? original.url : "";
    const isRefreshCall =
      url.includes("/auth/refresh") || url.replace(BASE_URL, "").includes("/auth/refresh");

    if (status === 401 && !original._retry && !isRefreshCall) {
      original._retry = true;

      if (isRefreshing) {
        return new Promise((resolve) => {
          waiting.push((token) => {
            if (token) {
              original.headers = original.headers ?? {};
              (original.headers as any).Authorization = `Bearer ${token}`;
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
          (original.headers as any).Authorization = `Bearer ${data.accessToken}`;
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
    throw new Error(
      data?.error || data?.message || "Failed to logout other devices."
    );
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
// ✅ Notifications
// ----------------------------------------------------
export type NotificationType =
  | "CHAT_MESSAGE"
  | "POST_COMMENT"
  | "POST_LIKE"
  | "COMMENT_LIKE";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  url?: string | null;
  entityId?: string | null;
  isRead: boolean;
  createdAt: string;
  readAt?: string | null;
};

export async function fetchNotifications(params?: {
  unreadOnly?: boolean;
  take?: number;
}) {
  const unreadOnly = params?.unreadOnly ? 1 : 0;
  const take = params?.take ?? 20;

  const { data } = await api.get<{ items: NotificationItem[] }>(
    `/notifications?unreadOnly=${unreadOnly}&take=${take}`
  );
  return data;
}

export async function fetchUnreadNotificationsCount() {
  const { data } = await api.get<{ count: number }>(`/notifications/unread-count`);
  return data;
}

export async function markNotificationsRead(ids: string[]) {
  const { data } = await api.post<{ ok: true }>(`/notifications/mark-read`, { ids });
  return data;
}

export async function markAllNotificationsRead() {
  const { data } = await api.post<{ ok: true }>(`/notifications/mark-all-read`, {});
  return data;
}

export async function deleteNotification(id: string) {
  const { data } = await api.delete<{ ok: boolean; deletedId?: string; message?: string }>(
    `/notifications/${id}`
  );
  if (!data.ok) throw new Error(data.message || "Failed to delete notification");
  return data;
}

export async function deleteAllNotifications() {
  const { data } = await api.delete<{ ok: boolean; deleted: number }>(`/notifications`);
  if (!data.ok) throw new Error("Failed to delete notifications");
  return data;
}

export async function deleteReadNotifications() {
  const { data } = await api.delete<{ ok: boolean; deleted: number }>(
    `/notifications/read/all`
  );
  if (!data.ok) throw new Error("Failed to delete read notifications");
  return data;
}

// ----------------------------------------------------
// ✅ Challenges
// ----------------------------------------------------
export type ChallengeLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "PRO";

export type ChallengeItem = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  description: string;
  style: string;
  level: ChallengeLevel;
  startsAt: string;
  endsAt: string;
  status: "ACTIVE" | "ENDED";
  exampleVideoUrl?: string | null;

  creator: ApiUserSummary;

  _count: {
    participants: number;
    submissions: number;
  };
};

export type ChallengeSubmissionItem = {
  id: string;
  createdAt: string;
  videoUrl: string;
  videoType?: string | null;
  caption?: string | null;
  user: ApiUserSummary;
};

export async function fetchNewChallenges(take = 12) {
  const { data } = await api.get<{ items: ChallengeItem[] }>("/challenges/new", {
    params: { take },
  });
  return data;
}

export async function fetchTrendingChallenges(take = 12) {
  const { data } = await api.get<{ items: ChallengeItem[] }>(
    "/challenges/trending",
    { params: { take } }
  );
  return data;
}

export async function fetchMyAcceptedChallenges(take = 24) {
  const { data } = await api.get<{ items: ChallengeItem[] }>(
    "/challenges/mine/accepted",
    { params: { take } }
  );
  return data;
}

export async function fetchMyCreatedChallenges(take = 24) {
  const { data } = await api.get<{ items: ChallengeItem[] }>(
    "/challenges/mine/created",
    { params: { take } }
  );
  return data;
}

export async function acceptChallenge(challengeId: string) {
  const { data } = await api.post<{ ok: true; acceptedAt: string }>(
    `/challenges/${challengeId}/accept`
  );
  return data;
}

export async function createChallenge(form: {
  title: string;
  description: string;
  style: string;
  level: ChallengeLevel;
  durationDays: number;
  exampleFile?: File | null;
}) {
  const fd = new FormData();
  fd.set("title", form.title);
  fd.set("description", form.description);
  fd.set("style", form.style);
  fd.set("level", form.level);
  fd.set("durationDays", String(form.durationDays));
  if (form.exampleFile) fd.set("example", form.exampleFile);

  const { data } = await api.post<{ challenge: ChallengeItem }>(
    "/challenges",
    fd,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}

export async function fetchChallengeSubmissions(challengeId: string, take = 20) {
  const { data } = await api.get<{ items: ChallengeSubmissionItem[] }>(
    `/challenges/${challengeId}/submissions`,
    { params: { take } }
  );
  return data;
}

export async function submitChallengeVideo(
  challengeId: string,
  video: File,
  caption?: string
) {
  const fd = new FormData();
  fd.set("video", video);
  if (caption?.trim()) fd.set("caption", caption.trim());

  const { data } = await api.post<{ submission: ChallengeSubmissionItem }>(
    `/challenges/${challengeId}/submissions`,
    fd,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}

export async function deleteChallenge(id: string) {
  const { data } = await api.delete<{ ok: boolean; deletedId?: string; error?: string }>(
    `/challenges/${id}`
  );
  if (!data.ok) throw new Error(data.error || "Failed to delete challenge");
  return data;
}

export async function leaveChallenge(challengeId: string) {
  const { data } = await api.delete<{ ok: true }>(
    `/challenges/${challengeId}/accept`
  );
  return data;
}

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

// ----------------------------------------------------
// Chats (DM)
// ----------------------------------------------------
export type ChatPeer = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type ChatLastMessage = {
  id: string;
  text: string;
  createdAt: string;
  editedAt?: string | null; // ✅ NEW
  senderId: string;
} | null;

export type ChatConversationListItem = {
  id: string;
  updatedAt: string;
  peer: ChatPeer | null;
  lastMessage: ChatLastMessage;
};

export type ChatMessage = {
  id: string;
  text: string;
  createdAt: string;
  senderId: string;
  editedAt?: string | null;

  // ✅ reply
  replyToId?: string | null;
  replyTo?: {
    id: string;
    text: string;
    createdAt: string;
    senderId: string;
  } | null;

  // ✅ media
  mediaType?: "image" | "video" | null;
  mediaUrl?: string | null;
};

export async function openDm(userId: string) {
  const { data } = await api.post<{
    ok: boolean;
    conversationId: string;
    peer: ChatPeer;
    message?: string;
  }>(`/chats/dm/${userId}`);

  if (!data.ok) throw new Error(data.message || "Failed to open DM");
  return data;
}

export async function fetchConversations() {
  const { data } = await api.get<{
    ok: boolean;
    conversations: ChatConversationListItem[];
    error?: string;
    message?: string;
  }>("/chats/conversations");

  if (!data.ok) throw new Error(data.error || data.message || "Failed to load conversations");
  return data.conversations ?? [];
}

export async function fetchConversationMessages(conversationId: string) {
  const { data } = await api.get<{
    ok: boolean;
    messages: ChatMessage[];
    error?: string;
    message?: string;
  }>(`/chats/conversations/${conversationId}/messages`);

  if (!data.ok) throw new Error(data.error || data.message || "Failed to load messages");
  return { messages: data.messages ?? [] };
}

export async function sendConversationMessage(
  conversationId: string,
  text: string,
  replyToId?: string | null
) {
  const { data } = await api.post<{
    ok: boolean;
    message: ChatMessage;
    error?: string;
  }>(`/chats/conversations/${conversationId}/messages`, {
    text: text.trim(),
    replyToId: replyToId || undefined,
  });

  if (!data.ok) {
    throw new Error(data.error || "Failed to send message");
  }

  return data.message;
}

export async function deleteChatMessage(messageId: string) {
  const { data } = await api.delete<{ ok: boolean; deletedId?: string; message?: string }>(
    `/chats/messages/${messageId}`
  );
  if (!data.ok) throw new Error(data.message || "Failed to delete message");
  return data;
}

// ✅ NEW: Edit message
export async function editConversationMessage(messageId: string, text: string) {
  const { data } = await api.patch<{
    ok: boolean;
    message?: ChatMessage;
    error?: string;
  }>(`/chats/messages/${messageId}`, { text: text.trim() });

  if (!data.ok || !data.message) {
    throw new Error(data.error || "Failed to edit message");
  }

  return data.message;
}

// ✅ Send message with media (image/video) - multipart/form-data
export async function sendConversationMedia(
  conversationId: string,
  files: File[],
  text?: string,
  replyToId?: string
): Promise<ChatMessage[]> {
  const fd = new FormData();

  for (const f of files) fd.append("media", f); // ✅ same key as backend
  if (text && text.trim()) fd.append("text", text.trim());
  if (replyToId) fd.append("replyToId", replyToId);

  const { data } = await api.post(
    `/chats/conversations/${conversationId}/messages/media`,
    fd,
    { headers: { "Content-Type": "multipart/form-data" } }
  );

  // backend returns { ok: true, messages: [...] }
  return data.messages as ChatMessage[];
}
