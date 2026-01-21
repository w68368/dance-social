// apps/web/src/pages/UserProfile.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  fetchUserPosts,
  fetchFollowStats,
  followUser,
  unfollowUser,
  fetchFollowers,
  fetchUserPublic,
  openDm,
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
  const navigate = useNavigate();

  const [owner, setOwner] = useState<ApiUserSummary | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [followStats, setFollowStats] = useState<FollowStatsResponse | null>(null);
  const [followLoading, setFollowLoading] = useState(false);

  const [messageLoading, setMessageLoading] = useState(false);

  const [followersOpen, setFollowersOpen] = useState(false);
  const [followersList, setFollowersList] = useState<ApiUserSummary[]>([]);
  const [followersLoading, setFollowersLoading] = useState(false);

  const me = getUser();

  // -----------------------------
  // Reset transient UI on user change
  // -----------------------------
  useEffect(() => {
    setSelectedPost(null);
    setFollowersOpen(false);
    setFollowersList([]);
    setFollowersLoading(false);
    setError(null);
  }, [userId]);

  // -----------------------------
  // Load posts + public profile
  // -----------------------------
  useEffect(() => {
    if (!userId) return;

    let alive = true;

    async function loadAll(id: string) {
      try {
        setLoading(true);
        setError(null);

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
          setOwner(loadedPosts[0].author);
        } else {
          setOwner(null);
        }
      } catch (err: any) {
        if (!alive) return;
        const message =
          err?.response?.data?.message ?? "Failed to load user profile.";
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
  // Load follow stats (requires auth on your backend)
  // -----------------------------
  useEffect(() => {
    if (!userId) return;

    let alive = true;

    async function loadStats(id: string) {
      try {
        const { data } = await fetchFollowStats(id);
        if (!alive) return;
        if (data.ok) setFollowStats(data);
      } catch (err) {
        console.error("Follow stats error", err);
        if (!alive) return;
        setFollowStats(null);
      }
    }

    loadStats(userId);

    return () => {
      alive = false;
    };
  }, [userId]);

  // -----------------------------
  // Derived values
  // -----------------------------
  const postsCount = posts.length;

  const totalLikes = useMemo(() => {
    return posts.reduce(
      (sum, p) => sum + (typeof p.likesCount === "number" ? p.likesCount : 0),
      0
    );
  }, [posts]);

  const followersCount = followStats?.followers ?? 0;
  const followingCount = followStats?.following ?? 0;

  const isOwnProfile = !!(me && owner && me.id === owner.id);

  const ownerName = owner ? owner.displayName || owner.username : "User";
  const ownerHandle = owner ? `@${owner.username}` : "";

  const showFollowArea = !!owner && !isOwnProfile;
  const canFollow = !!me && !!followStats;
  const isFollowing = !!followStats?.isFollowing;

  // Message only for following
  const showMessage = showFollowArea && isFollowing;

  // -----------------------------
  // Follow / unfollow
  // -----------------------------
  async function handleFollowToggle() {
    if (!userId) return;

    if (!me) {
      navigate(`/login?next=/users/${userId}`);
      return;
    }

    if (!followStats || followLoading) return;

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

  // -----------------------------
  // Message button (only if following)
  // -----------------------------
  async function handleMessage() {
    if (!userId) return;

    if (!me) {
      navigate(`/login?next=/users/${userId}`);
      return;
    }

    if (!followStats?.isFollowing) return;
    if (messageLoading) return;

    try {
      setMessageLoading(true);
      await openDm(userId);
      navigate(`/chats/${userId}`);
    } catch (err: any) {
      console.error("Open DM error", err);
      setError(err?.response?.data?.message ?? "Failed to open chat.");
    } finally {
      setMessageLoading(false);
    }
  }

  // -----------------------------
  // Followers modal
  // -----------------------------
  async function openFollowersModal() {
    if (!userId) return;

    if (!me) {
      navigate(`/login?next=/users/${userId}`);
      return;
    }

    setFollowersOpen(true);
    setFollowersLoading(true);

    try {
      const { data } = await fetchFollowers(userId);
      if (data.ok) setFollowersList(data.users ?? []);
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

  // -----------------------------
  // Post comments
  // -----------------------------
  function closePostModal() {
    setSelectedPost(null);
  }

  const handleCommentAdded = (postId: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, commentsCount: (p.commentsCount ?? 0) + 1 }
          : p
      )
    );

    setSelectedPost((prev) =>
      prev && prev.id === postId
        ? { ...prev, commentsCount: (prev.commentsCount ?? 0) + 1 }
        : prev
    );
  };

  // -----------------------------
  // Render guards
  // -----------------------------
  if (!userId) {
    return (
      <main className="profile-page">
        <div className="profile-container">
          <p>User id was not provided.</p>
        </div>
      </main>
    );
  }

  if (loading && !owner) {
    return (
      <main className="profile-page">
        <div className="profile-container">
          <p>Loading profile…</p>
        </div>
      </main>
    );
  }

  if (!owner) {
    return (
      <main className="profile-page">
        <div className="profile-container">
          <p>{error ?? "User profile not found."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="profile-page">
      <div className="profile-container">
        {/* Profile header */}
        <section
          className="profile-header"
        >
          <div className="profile-avatar">
            {owner.avatarUrl ? (
              <img src={owner.avatarUrl} alt={ownerName} />
            ) : (
              <span>{ownerName.charAt(0).toUpperCase()}</span>
            )}
          </div>

          <div className="profile-header-main">
            <h1 className="profile-username">{ownerName}</h1>
            {ownerHandle && <div className="profile-handle">{ownerHandle}</div>}

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
                title={!me ? "Sign in to view followers" : "View followers"}
              >
                <span className="profile-stat-number">{followersCount}</span>
                <span className="profile-stat-label">followers</span>
              </button>

              <div className="profile-stat">
                <span className="profile-stat-number">{followingCount}</span>
                <span className="profile-stat-label">following</span>
              </div>
            </div>

            {/* Actions */}
            {showFollowArea && (
              <div className="profile-actions">
                <button
                  type="button"
                  className={"btn-follow" + (isFollowing ? " following" : "")}
                  disabled={followLoading || !canFollow}
                  onClick={handleFollowToggle}
                >
                  {followLoading
                    ? "Please wait…"
                    : isFollowing
                    ? "Following"
                    : "Follow"}
                </button>

                {showMessage && (
                  <button
                    type="button"
                    className="btn-message"
                    disabled={messageLoading}
                    onClick={handleMessage}
                    title="Open chat"
                  >
                    {messageLoading ? "Opening…" : "Message"}
                  </button>
                )}
              </div>
            )}

            <div className="profile-meta">
              {loading && <span>Loading posts…</span>}
              {!loading && posts.length === 0 && <span>No posts yet.</span>}
            </div>
          </div>
        </section>

        <div className="profile-bottom-line" />

        {error && <div className="feed-error">{error}</div>}

        {/* Posts grid */}
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
                        <img src={src} alt={post.caption ?? "Post media"} />
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

      {/* Selected post modal */}
      <PostCommentsModal
        post={selectedPost}
        isOpen={selectedPost !== null}
        onClose={closePostModal}
        onCommentAdded={() => {
          if (selectedPost) handleCommentAdded(selectedPost.id);
        }}
      />

      {/* Followers list modal */}
      {followersOpen && (
        <div
          className="post-modal-backdrop"
          onClick={closeFollowersModal}
          role="presentation"
        >
          <div
            className="followers-modal"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
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
              <div className="followers-empty">Loading followers…</div>
            )}

            {!followersLoading && followersList.length === 0 && (
              <div className="followers-empty">No followers yet.</div>
            )}

            {!followersLoading && followersList.length > 0 && (
              <ul className="followers-list">
                {followersList.map((u) => {
                  const name = u.displayName || u.username || "User";
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
