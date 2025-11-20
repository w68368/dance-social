// apps/web/src/pages/Profile.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  fetchUserPosts,
  fetchFollowers,
  type Post,
  type FollowStatsResponse,
  type ApiUserSummary,
} from "../api";
import type { PublicUser } from "../lib/auth";
import { getUser, setUser } from "../lib/auth";

import "../styles/pages/profile.css";
import "../styles/pages/feed.css";

import PostCommentsModal from "../components/PostCommentsModal";

export default function Profile() {
  const [me, setMe] = useState<PublicUser | null>(getUser());
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // статистика подписок
  const [followStats, setFollowStats] = useState<FollowStatsResponse | null>(
    null
  );

  // модалка подписчиков
  const [followersOpen, setFollowersOpen] = useState(false);
  const [followersList, setFollowersList] = useState<ApiUserSummary[]>([]);
  const [followersLoading, setFollowersLoading] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // актуализируем текущего пользователя
        const { data } = await api.get("/auth/me");
        if (!alive) return;

        if (!data?.ok || !data?.user) {
          setError("Не удалось загрузить профиль");
          setLoading(false);
          return;
        }

        const user: PublicUser = data.user;
        setMe(user);
        setUser(user); // обновляем кэш в localStorage

        // параллельно грузим посты и статистику подписок
        const [postsResp, followResp] = await Promise.all([
          fetchUserPosts(user.id),
          api.get<FollowStatsResponse>(`/follow/stats/${user.id}`),
        ]);

        if (!alive) return;

        const loadedPosts = postsResp.data.posts ?? [];
        setPosts(loadedPosts);

        if (followResp.data?.ok) {
          setFollowStats(followResp.data);
        }
      } catch (err: any) {
        if (!alive) return;

        const message =
          err?.response?.data?.message ??
          "Не удалось загрузить профиль. Попробуй ещё раз позже.";
        setError(message);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, []);

  const postsCount = posts.length;
  const totalLikes = useMemo(
    () =>
      posts.reduce(
        (sum, p) => sum + (typeof p.likesCount === "number" ? p.likesCount : 0),
        0
      ),
    [posts]
  );

  const followersCount = followStats?.followers ?? 0;
  const followingCount = followStats?.following ?? 0;

  function closePostModal() {
    setSelectedPost(null);
  }

  // когда добавили комментарий в модалке — обновляем счётчики
  const handleCommentAdded = (postId: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p
      )
    );

    setSelectedPost((prev) =>
      prev && prev.id === postId
        ? { ...prev, commentsCount: prev.commentsCount + 1 }
        : prev
    );
  };

  // открыть модалку подписчиков
  async function openFollowersModal() {
    if (!me) return;

    setFollowersOpen(true);
    setFollowersLoading(true);
    try {
      const { data } = await fetchFollowers(me.id);
      if (data.ok) {
        setFollowersList(data.users);
      }
    } catch (err) {
      console.error("Followers list error", err);
    } finally {
      setFollowersLoading(false);
    }
  }

  function closeFollowersModal() {
    setFollowersOpen(false);
    setFollowersList([]);
  }

  if (loading && !me) {
    return (
      <main className="profile-page">
        <div className="profile-container">
          <p>Загружаем профиль…</p>
        </div>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="profile-page">
        <div className="profile-container">
          <p>{error ?? "Профиль не найден."}</p>
        </div>
      </main>
    );
  }

  const displayName = me.displayName || me.username;

  return (
    <main className="profile-page">
      <div className="profile-container">
        {/* Шапка профиля */}
        <section className="profile-header">
          <div className="profile-avatar">
            {me.avatarUrl ? (
              <img src={me.avatarUrl} alt={displayName} />
            ) : (
              <span>{displayName.charAt(0).toUpperCase()}</span>
            )}
          </div>

          <div className="profile-header-main">
            <h1 className="profile-username">{displayName}</h1>

            <div className="profile-stats">
              <div className="profile-stat">
                <span className="profile-stat-number">{postsCount}</span>
                <span className="profile-stat-label">posts</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-number">{totalLikes}</span>
                <span className="profile-stat-label">likes</span>
              </div>

              {/* кликабельный followers → модалка */}
              <button
                type="button"
                className="profile-stat profile-stat-clickable"
                onClick={openFollowersModal}
              >
                <span className="profile-stat-number">{followersCount}</span>
                <span className="profile-stat-label">followers</span>
              </button>

              <div className="profile-stat">
                <span className="profile-stat-number">{followingCount}</span>
                <span className="profile-stat-label">following</span>
              </div>
            </div>

            <div className="profile-meta">
              {me.createdAt && (
                <span>
                  Joined: {new Date(me.createdAt).toLocaleDateString()}
                </span>
              )}
              {me.email && <span>Email: {me.email}</span>}
            </div>
          </div>
        </section>

        <div className="profile-bottom-line"></div>

        {/* Сетка постов */}
        {error && <div className="feed-error">{error}</div>}

        {posts.length === 0 && !loading && (
          <div className="profile-empty">
            У тебя ещё нет постов. Добавь первый через кнопку “Add post”.
          </div>
        )}

        {posts.length > 0 && (
          <>
            <h2 className="profile-section-title">Posts</h2>
            <div className="profile-posts-grid">
              {posts.map((post) => {
                const src = post.mediaUrl ?? post.mediaLocalPath ?? "";
                return (
                  <button
                    key={post.id}
                    type="button"
                    className="profile-post-tile"
                    onClick={() => setSelectedPost(post)}
                  >
                    <div className="profile-post-media-thumb">
                      {post.mediaType === "video" ? (
                        <video src={src} muted preload="metadata" />
                      ) : (
                        <img src={src} alt={post.caption} />
                      )}
                    </div>
                    <div className="profile-post-overlay-info">
                      <span>❤ {post.likesCount}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Модалка выбранного поста — такая же, как в Feed */}
      <PostCommentsModal
        post={selectedPost}
        isOpen={selectedPost !== null}
        onClose={closePostModal}
        onCommentAdded={() => {
          if (selectedPost) {
            handleCommentAdded(selectedPost.id);
          }
        }}
      />

      {/* модалка списка подписчиков */}
      {followersOpen && (
        <div className="post-modal-backdrop" onClick={closeFollowersModal}>
          <div className="followers-modal" onClick={(e) => e.stopPropagation()}>
            <div className="followers-modal-header">
              <h2>Followers</h2>
              <button
                type="button"
                className="post-modal-close"
                onClick={closeFollowersModal}
              >
                ×
              </button>
            </div>

            {followersLoading && (
              <div className="followers-empty">Загружаем подписчиков…</div>
            )}

            {!followersLoading && followersList.length === 0 && (
              <div className="followers-empty">Пока нет подписчиков.</div>
            )}

            {!followersLoading && followersList.length > 0 && (
              <ul className="followers-list">
                {followersList.map((u) => {
                  const name = u.displayName || u.username;

                  return (
                    <li key={u.id} className="followers-item">
                      <Link to={`/users/${u.id}`} onClick={closeFollowersModal}>
                        <div className="followers-avatar">
                          {u.avatarUrl ? (
                            <img src={u.avatarUrl} alt={name} />
                          ) : (
                            <span>{name.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <span className="followers-username">{name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
