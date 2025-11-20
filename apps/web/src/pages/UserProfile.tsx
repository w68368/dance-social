// apps/web/src/pages/UserProfile.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  fetchUserPosts,
  fetchFollowStats,
  followUser,
  unfollowUser,
  fetchFollowers,
  fetchUserPublic,
  type Post,
  type ApiUserSummary,
  type FollowStatsResponse,
} from "../api";

import "../styles/pages/profile.css";
import "../styles/pages/feed.css";
import { getUser } from "../lib/auth";
import PostCommentsModal from "../components/PostCommentsModal";

export default function UserProfile() {
  const { userId } = useParams<{ userId: string }>();

  const [owner, setOwner] = useState<ApiUserSummary | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // стейт подписок
  const [followStats, setFollowStats] = useState<FollowStatsResponse | null>(
    null
  );
  const [followLoading, setFollowLoading] = useState(false);

  // модалка подписчиков
  const [followersOpen, setFollowersOpen] = useState(false);
  const [followersList, setFollowersList] = useState<ApiUserSummary[]>([]);
  const [followersLoading, setFollowersLoading] = useState(false);

  const me = getUser();

  // -----------------------------
  // Загрузка постов + профиля
  // -----------------------------
  useEffect(() => {
    if (!userId) return;

    let alive = true;

    async function loadAll(id: string) {
      try {
        setLoading(true);
        setError(null);

        // грузим посты и публичный профиль параллельно
        const [postsResp, userResp] = await Promise.all([
          fetchUserPosts(id),
          fetchUserPublic(id),
        ]);

        if (!alive) return;

        const loadedPosts = postsResp.data.posts ?? [];
        setPosts(loadedPosts);

        if (userResp.data?.ok && userResp.data.user) {
          setOwner(userResp.data.user);
        } else if (loadedPosts.length > 0) {
          // запасной вариант — берем автора из поста
          setOwner(loadedPosts[0].author);
        } else {
          setOwner(null);
        }
      } catch (err: any) {
        if (!alive) return;

        const message =
          err?.response?.data?.message ??
          "Не удалось загрузить профиль пользователя.";
        setError(message);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    loadAll(userId);

    return () => {
      alive = false;
    };
  }, [userId]);

  // -----------------------------
  // Загрузка статистики подписок
  // -----------------------------
  useEffect(() => {
    if (!userId) return;

    let alive = true;

    async function loadStats(id: string) {
      try {
        const { data } = await fetchFollowStats(id);
        if (!alive) return;
        if (data.ok) {
          setFollowStats(data);
        }
      } catch (err) {
        console.error("Follow stats error", err);
      }
    }

    loadStats(userId);

    return () => {
      alive = false;
    };
  }, [userId]);

  const postsCount = posts.length;

  const totalLikes = useMemo(
    () =>
      posts.reduce(
        (sum, p) => sum + (typeof p.likesCount === "number" ? p.likesCount : 0),
        0
      ),
    [posts]
  );

  // Подписка / отписка
  async function handleFollowToggle() {
    if (!userId || !followStats || followLoading) return;

    try {
      setFollowLoading(true);

      if (followStats.isFollowing) {
        const { data } = await unfollowUser(userId);
        if (data.ok) {
          setFollowStats((prev) =>
            prev
              ? {
                  ...prev,
                  isFollowing: false,
                  followers: Math.max(prev.followers - 1, 0),
                }
              : prev
          );
        }
      } else {
        const { data } = await followUser(userId);
        if (data.ok) {
          setFollowStats((prev) =>
            prev
              ? {
                  ...prev,
                  isFollowing: true,
                  followers: prev.followers + 1,
                }
              : prev
          );
        }
      }
    } catch (err) {
      console.error("Follow toggle error", err);
    } finally {
      setFollowLoading(false);
    }
  }

  // Открытие модалки followers
  async function openFollowersModal() {
    if (!userId) return;

    setFollowersOpen(true);
    setFollowersLoading(true);
    try {
      const { data } = await fetchFollowers(userId);
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

  if (!userId) {
    return (
      <main className="profile-page">
        <div className="profile-container">
          <p>Не передан id пользователя.</p>
        </div>
      </main>
    );
  }

  const followersCount = followStats?.followers ?? 0;
  const followingCount = followStats?.following ?? 0;

  const isOwnProfile = me && owner && me.id === owner.id;

  return (
    <main className="profile-page">
      <div className="profile-container">
        {/* Шапка профиля */}
        <section className="profile-header">
          <div className="profile-avatar">
            {owner?.avatarUrl ? (
              <img src={owner.avatarUrl} alt={owner.username} />
            ) : (
              <span>
                {owner?.username ? owner.username.charAt(0).toUpperCase() : "U"}
              </span>
            )}
          </div>

          <div className="profile-header-main">
            <h1 className="profile-username">{owner?.username ?? "User"}</h1>

            <div className="profile-stats">
              <div className="profile-stat">
                <span className="profile-stat-number">{postsCount}</span>
                <span className="profile-stat-label">posts</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-number">{totalLikes}</span>
                <span className="profile-stat-label">likes</span>
              </div>

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

            {/* кнопка Follow только для чужого профиля */}
            {followStats && !isOwnProfile && (
              <button
                type="button"
                className={
                  "btn-follow" + (followStats.isFollowing ? " following" : "")
                }
                disabled={followLoading}
                onClick={handleFollowToggle}
              >
                {followLoading
                  ? "..."
                  : followStats.isFollowing
                  ? "Following"
                  : "Follow"}
              </button>
            )}

            <div className="profile-meta">
              {loading && <span>Загружаем посты…</span>}
              {!loading && posts.length === 0 && <span>Пока нет постов.</span>}
            </div>
          </div>
        </section>

        <div className="profile-bottom-line"></div>

        {error && <div className="feed-error">{error}</div>}

        {/* Сетка постов */}
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

      {/* Модалка выбранного поста — такая же, как в Feed/Profile */}
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

      {/* Модалка списка фолловеров */}
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
                {followersList.map((u) => (
                  <li key={u.id} className="followers-item">
                    <Link to={`/users/${u.id}`} onClick={closeFollowersModal}>
                      <div className="followers-avatar">
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt={u.username} />
                        ) : (
                          <span>{u.username.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <span className="followers-username">{u.username}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
