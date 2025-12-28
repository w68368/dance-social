// apps/web/src/pages/Profile.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  fetchUserPosts,
  fetchFollowers,
  deletePost,
  updatePostCaption,
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

  // follow stats
  const [followStats, setFollowStats] = useState<FollowStatsResponse | null>(
    null
  );

  // followers modal
  const [followersOpen, setFollowersOpen] = useState(false);
  const [followersList, setFollowersList] = useState<ApiUserSummary[]>([]);
  const [followersLoading, setFollowersLoading] = useState(false);

  // post menu (⋯)
  const [openMenuPostId, setOpenMenuPostId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // delete confirm modal
  const [confirmDelete, setConfirmDelete] = useState<Post | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const prevPostsRef = useRef<Post[] | null>(null);

  // edit caption modal
  const [editPost, setEditPost] = useState<Post | null>(null);
  const [editCaption, setEditCaption] = useState<string>("");
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const prevCaptionRef = useRef<string>("");

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // refresh current user info
        const { data } = await api.get("/auth/me");
        if (!alive) return;

        if (!data?.ok || !data?.user) {
          setError("Failed to load profile");
          setLoading(false);
          return;
        }

        const user: PublicUser = data.user;
        setMe(user);
        setUser(user); // update cache in localStorage

        // in parallel, load posts and follow stats
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
          "Failed to load profile. Please try again later.";
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

  // Close menu on outside click + Escape
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!openMenuPostId) return;
      const t = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(t)) {
        setOpenMenuPostId(null);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenMenuPostId(null);
        setConfirmDelete(null);
        setEditPost(null);
      }
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenuPostId]);

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

  // when a comment is added in the modal — update counters
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

  // open followers modal
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

  const handleDeletePost = async (post: Post) => {
    if (!post?.id) return;

    setDeletingId(post.id);
    setError(null);

    // optimistic remove + remember snapshot for rollback
    setPosts((prev) => {
      prevPostsRef.current = prev;
      return prev.filter((p) => p.id !== post.id);
    });

    // close related UI
    if (selectedPost?.id === post.id) {
      setSelectedPost(null);
    }

    try {
      await deletePost(post.id);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to delete the post.");

      // rollback
      if (prevPostsRef.current) {
        setPosts(prevPostsRef.current);
      }
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
      setOpenMenuPostId(null);
      prevPostsRef.current = null;
    }
  };

  const handleSaveCaption = async () => {
    if (!editPost) return;

    const postId = editPost.id;
    const nextCaption = editCaption.trim(); // can be ""

    setSavingEditId(postId);
    setError(null);

    // optimistic update + remember prev caption for rollback
    prevCaptionRef.current = editPost.caption ?? "";
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, caption: nextCaption } : p))
    );

    // keep modal post in sync if it’s currently opened
    setSelectedPost((prev) =>
      prev && prev.id === postId ? { ...prev, caption: nextCaption } : prev
    );

    try {
      await updatePostCaption(postId, nextCaption);
      setEditPost(null);
      setEditCaption("");
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to update caption."
      );

      // rollback
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, caption: prevCaptionRef.current } : p
        )
      );
      setSelectedPost((prev) =>
        prev && prev.id === postId
          ? { ...prev, caption: prevCaptionRef.current }
          : prev
      );
    } finally {
      setSavingEditId(null);
      prevCaptionRef.current = "";
      setOpenMenuPostId(null);
    }
  };

  if (loading && !me) {
    return (
      <main className="profile-page">
        <div className="profile-container">
          <p>Loading profile…</p>
        </div>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="profile-page">
        <div className="profile-container">
          <p>{error ?? "Profile not found."}</p>
        </div>
      </main>
    );
  }

  const displayName = me.displayName || me.username;

  return (
    <main className="profile-page">
      <div className="profile-container">
        {/* Profile header */}
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

              {/* clickable followers → opens modal */}
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
          </div>
        </section>

        <div className="profile-bottom-line"></div>

        {/* Posts grid */}
        {error && <div className="feed-error">{error}</div>}

        {posts.length === 0 && !loading && (
          <div className="profile-empty">
            You don&apos;t have any posts yet. Add your first one using the
            “Add post” button.
          </div>
        )}

        {posts.length > 0 && (
          <>
            <h2 className="profile-section-title">Posts</h2>
            <div className="profile-posts-grid">
              {posts.map((post) => {
                const src = post.mediaUrl ?? post.mediaLocalPath ?? "";

                return (
                  <div key={post.id} className="profile-post-tile-wrap">
                    {/* click to open modal */}
                    <button
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

                    {/* ⋯ menu (hover + click) */}
                    <div
                      className="profile-post-more"
                      ref={(el) => {
                        if (openMenuPostId === post.id) {
                          menuRef.current = el;
                        }
                      }}
                    >
                      <button
                        type="button"
                        className="profile-post-more-btn"
                        aria-label="Post menu"
                        aria-haspopup="menu"
                        aria-expanded={openMenuPostId === post.id}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOpenMenuPostId((cur) =>
                            cur === post.id ? null : post.id
                          );
                        }}
                      >
                        ⋯
                      </button>

                      {openMenuPostId === post.id && (
                        <div className="profile-post-menu" role="menu">
                          <button
                            type="button"
                            className="profile-post-menu-item"
                            role="menuitem"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setEditPost(post);
                              setEditCaption(post.caption ?? "");
                              setOpenMenuPostId(null);
                            }}
                          >
                            Edit caption
                          </button>

                          <button
                            type="button"
                            className="profile-post-menu-item profile-post-menu-danger"
                            role="menuitem"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setConfirmDelete(post);
                              setOpenMenuPostId(null);
                            }}
                          >
                            Delete post
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Edit caption modal (reuse feed modal styles) */}
      {editPost && (
        <div
          className="feed-confirm-backdrop"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditPost(null);
          }}
        >
          <div className="feed-confirm-modal">
            <div className="feed-confirm-title">Edit caption</div>
            <div className="feed-confirm-text">Update your post description.</div>

            <textarea
              className="feed-edit-textarea"
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              placeholder="Write a caption…"
              rows={4}
              autoFocus
            />

            <div className="feed-confirm-actions">
              <button
                type="button"
                className="feed-confirm-btn feed-confirm-btn--ghost"
                onClick={() => setEditPost(null)}
                disabled={savingEditId === editPost.id}
              >
                Cancel
              </button>

              <button
                type="button"
                className="feed-confirm-btn"
                onClick={handleSaveCaption}
                disabled={savingEditId === editPost.id}
              >
                {savingEditId === editPost.id ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete modal (reuse feed modal styles) */}
      {confirmDelete && (
        <div
          className="feed-confirm-backdrop"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmDelete(null);
          }}
        >
          <div className="feed-confirm-modal">
            <div className="feed-confirm-title">Delete this post?</div>
            <div className="feed-confirm-text">This action can’t be undone.</div>

            <div className="feed-confirm-actions">
              <button
                type="button"
                className="feed-confirm-btn feed-confirm-btn--ghost"
                onClick={() => setConfirmDelete(null)}
                disabled={deletingId === confirmDelete.id}
              >
                Cancel
              </button>

              <button
                type="button"
                className="feed-confirm-btn feed-confirm-btn--danger"
                onClick={() => handleDeletePost(confirmDelete)}
                disabled={deletingId === confirmDelete.id}
              >
                {deletingId === confirmDelete.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected post modal — same as in Feed */}
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

      {/* followers list modal */}
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
              <div className="followers-empty">Loading followers…</div>
            )}

            {!followersLoading && followersList.length === 0 && (
              <div className="followers-empty">No followers yet.</div>
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
