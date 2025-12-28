// apps/web/src/pages/Feed.tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  fetchFeed,
  toggleLike,
  reactToPost,
  fetchPostReactions,
  deletePost,
  type Post,
  type ReactionType,
  type PostReactionsSummary,
  type FeedScope,
} from "../api";
import {
  FaHeart,
  FaRegHeart,
  FaRegCommentDots,
  FaFire,
  FaStar,
} from "react-icons/fa";
import { FaFaceSmileBeam, FaHandsClapping } from "react-icons/fa6";
import { getUser } from "../lib/auth";
import PostCommentsModal from "../components/PostCommentsModal";
import "../styles/pages/feed.css";

// reactions config for the popover
const REACTIONS: { type: ReactionType; icon: ReactNode; label: string }[] = [
  { type: "LIKE", icon: <FaHeart />, label: "Like" },
  { type: "FIRE", icon: <FaFire />, label: "Fire" },
  { type: "WOW", icon: <FaStar />, label: "Wow" },
  { type: "CUTE", icon: <FaFaceSmileBeam />, label: "Cute" },
  { type: "CLAP", icon: <FaHandsClapping />, label: "Clap" },
];

// icon to show on the main like button
function getMainReactionIcon(
  myReaction: ReactionType | null | undefined,
  likedByMe: boolean
) {
  if (!myReaction) {
    return likedByMe ? (
      <FaHeart className="like-icon" />
    ) : (
      <FaRegHeart className="like-icon" />
    );
  }

  switch (myReaction) {
    case "LIKE":
      return <FaHeart className="like-icon" />;
    case "FIRE":
      return <FaFire className="like-icon" />;
    case "WOW":
      return <FaStar className="like-icon" />;
    case "CUTE":
      return <FaFaceSmileBeam className="like-icon" />;
    case "CLAP":
      return <FaHandsClapping className="like-icon" />;
    default:
      return <FaHeart className="like-icon" />;
  }
}

export default function Feed() {
  const PAGE_SIZE = 5;

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true); // initial load
  const [loadingMore, setLoadingMore] = useState(false); // pagination load
  const [error, setError] = useState<string | null>(null);

  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // filter: all / following
  const [scope, setScope] = useState<FeedScope>("all");

  // comments modal
  const [commentsPost, setCommentsPost] = useState<Post | null>(null);

  // reactions summary per post: postId -> summary
  const [reactionsMap, setReactionsMap] = useState<
    Record<string, PostReactionsSummary>
  >({});

  // post menu (⋯)
  const [openMenuPostId, setOpenMenuPostId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // delete confirm modal
  const [confirmDelete, setConfirmDelete] = useState<Post | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const prevPostsRef = useRef<Post[] | null>(null);

  const me = getUser();

  const isBusy = useMemo(() => loading || loadingMore, [loading, loadingMore]);

  // Load first page / refresh feed
  const loadFirstPage = async (nextScope?: FeedScope) => {
    const activeScope = nextScope ?? scope;

    setLoading(true);
    setError(null);
    setCursor(null);
    setHasMore(true);
    setPosts([]);
    setReactionsMap({});

    try {
      const res = await fetchFeed({
        limit: PAGE_SIZE,
        cursor: null,
        scope: activeScope,
      });

      setPosts(res.data.posts ?? []);
      setCursor(res.data.nextCursor ?? null);
      setHasMore(!!res.data.hasMore);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load the feed.");
    } finally {
      setLoading(false);
    }
  };

  // Load next page
  const loadMore = async () => {
    if (loadingMore || loading) return;
    if (!hasMore) return;

    setLoadingMore(true);
    setError(null);

    try {
      const res = await fetchFeed({
        limit: PAGE_SIZE,
        cursor,
        scope,
      });

      const newPosts = res.data.posts ?? [];

      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        for (const p of newPosts) {
          if (!seen.has(p.id)) merged.push(p);
        }
        return merged;
      });

      setCursor(res.data.nextCursor ?? null);
      setHasMore(!!res.data.hasMore);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load more posts.");
    } finally {
      setLoadingMore(false);
    }
  };

  // initial load
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (cancelled) return;
      await loadFirstPage();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reload when scope changes (All / Following)
  useEffect(() => {
    loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // Auto-load on scroll (IntersectionObserver)
  useEffect(() => {
    const el = document.getElementById("feed-sentinel");
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (isBusy) return;
        if (!hasMore) return;
        loadMore();
      },
      { root: null, rootMargin: "600px", threshold: 0 }
    );

    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, hasMore, isBusy, scope]);

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
      }
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenuPostId]);

  // helper: apply reactions summary to a post + store it in reactionsMap
  const applyReactionsSummary = (
    postId: string,
    summary: PostReactionsSummary
  ) => {
    const total =
      summary.counts.LIKE +
      summary.counts.FIRE +
      summary.counts.WOW +
      summary.counts.CUTE +
      summary.counts.CLAP;

    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              likesCount: total,
              likedByMe: !!summary.myReaction,
              myReaction: summary.myReaction,
            }
          : p
      )
    );

    setReactionsMap((prev) => ({
      ...prev,
      [postId]: summary,
    }));
  };

  // lazily load reactions summary on first hover
  const ensureReactionsLoaded = async (postId: string) => {
    if (reactionsMap[postId]) return;
    try {
      const summary = await fetchPostReactions(postId);
      applyReactionsSummary(postId, summary);
    } catch (err) {
      console.error("Failed to load reactions", err);
    }
  };

  // quick like (LIKE) via main button
  const handleToggleLike = async (postId: string) => {
    // optimistic update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              likesCount: p.likesCount + (p.likedByMe ? -1 : 1),
              likedByMe: !p.likedByMe,
              myReaction: p.likedByMe ? null : "LIKE",
            }
          : p
      )
    );

    try {
      const summary = await toggleLike(postId);
      applyReactionsSummary(postId, summary);
    } catch (err) {
      console.error(err);
      // rollback on error
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                likesCount: p.likesCount + (p.likedByMe ? -1 : 1),
                likedByMe: !p.likedByMe,
                myReaction: p.likedByMe ? null : "LIKE",
              }
            : p
        )
      );
    }
  };

  // choose a specific reaction from the popover
  const handleReact = async (postId: string, type: ReactionType) => {
    try {
      const summary = await reactToPost(postId, type);
      applyReactionsSummary(postId, summary);
    } catch (err) {
      console.error(err);
    }
  };

  const openComments = (post: Post) => setCommentsPost(post);
  const closeComments = () => setCommentsPost(null);

  const handleCommentAdded = (postId: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p
      )
    );
  };

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
    if (commentsPost?.id === post.id) {
      setCommentsPost(null);
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

  return (
    <main className="su-main">
      <div className="container feed-container">
        <div className="feed-topbar">
          <h1 className="page-title feed-title">Feed</h1>

          {/* Filter */}
          <div className="feed-filter">
            <button
              className={`feed-filter-btn ${scope === "all" ? "is-active" : ""}`}
              onClick={() => setScope("all")}
              disabled={isBusy}
              type="button"
            >
              All
            </button>

            <button
              className={`feed-filter-btn ${
                scope === "following" ? "is-active" : ""
              }`}
              onClick={() => setScope("following")}
              disabled={isBusy || !me}
              title={!me ? "Login to view Following feed" : ""}
              type="button"
            >
              Following
            </button>
          </div>
        </div>

        {scope === "following" && !me && (
          <p className="feed-info" style={{ marginTop: 8 }}>
            Login to see posts from people you follow.
          </p>
        )}

        {loading && <p className="feed-info">Loading posts…</p>}

        {error && (
          <div style={{ marginBottom: 12 }}>
            <p className="feed-error">{error}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn"
                onClick={() => loadFirstPage()}
                disabled={isBusy}
                type="button"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <p className="feed-empty">
            {scope === "following" ? (
              <>
                No posts from your subscriptions yet. Try following more dancers
                ✨
              </>
            ) : (
              <>
                There are no posts in the feed yet. Try publishing something via{" "}
                <strong>Add post</strong>.
              </>
            )}
          </p>
        )}

        <div className="feed-list">
          {posts.map((post) => {
            const isMe = me && me.id === post.author.id;
            const profileLink = isMe ? "/profile" : `/users/${post.author.id}`;
            const authorName = post.author.displayName || post.author.username;

            const mainIcon = getMainReactionIcon(
              post.myReaction ?? null,
              post.likedByMe
            );

            const summary = reactionsMap[post.id];

            return (
              <article key={post.id} className="feed-card">
                <header className="feed-card-header">
                  <Link to={profileLink} className="feed-user-link">
                    <div className="feed-user">
                      {post.author.avatarUrl ? (
                        <img
                          src={post.author.avatarUrl}
                          alt={authorName}
                          className="feed-avatar"
                        />
                      ) : (
                        <div className="feed-avatar-placeholder">
                          {authorName.slice(0, 1).toUpperCase()}
                        </div>
                      )}

                      <div>
                        <div className="feed-username">{authorName}</div>
                        <div className="feed-date">
                          {new Date(post.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </Link>

                  {/* ⋯ menu (only for author) */}
                  {isMe && (
                    <div
                      className="feed-more"
                      ref={(el) => {
                        if (openMenuPostId === post.id) {
                          menuRef.current = el;
                        }
                      }}
                    >
                      <button
                        type="button"
                        className="feed-more-btn"
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
                        <div className="feed-menu" role="menu">
                          <button
                            type="button"
                            className="feed-menu-item feed-menu-danger"
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
                  )}
                </header>

                {post.mediaUrl && post.mediaType === "image" && (
                  <img
                    src={post.mediaUrl}
                    className="feed-media feed-media-image"
                    alt="post media"
                  />
                )}

                {post.mediaUrl && post.mediaType === "video" && (
                  <video
                    src={post.mediaUrl}
                    controls
                    className="feed-media feed-media-video"
                  />
                )}

                {post.caption && <p className="feed-caption">{post.caption}</p>}

                <div className="feed-footer">
                  <div
                    className="feed-like-wrapper"
                    onMouseEnter={() => ensureReactionsLoaded(post.id)}
                  >
                    <div className="feed-reactions-popover">
                      {REACTIONS.map((r) => {
                        const isActive = post.myReaction === r.type;
                        const count = summary?.counts[r.type] ?? 0;

                        return (
                          <button
                            key={r.type}
                            className={`reaction-chip ${
                              isActive ? "reaction-chip--active" : ""
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReact(post.id, r.type);
                            }}
                            title={r.label}
                            type="button"
                          >
                            <span className="reaction-chip-icon">{r.icon}</span>
                            {count > 0 && (
                              <span className="reaction-chip-count">
                                {count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      className={`like-btn ${post.likedByMe ? "liked" : ""}`}
                      onClick={() => handleToggleLike(post.id)}
                      type="button"
                    >
                      {mainIcon}
                      <span className="like-count">{post.likesCount}</span>
                    </button>
                  </div>

                  <button
                    className="comment-btn"
                    onClick={() => openComments(post)}
                    type="button"
                  >
                    <FaRegCommentDots className="comment-icon" />
                    <span className="comment-count">{post.commentsCount}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {/* Sentinel for infinite scroll */}
        <div id="feed-sentinel" style={{ height: 1 }} />

        {/* Fallback button */}
        {!loading && !error && hasMore && (
          <div style={{ display: "flex", justifyContent: "center", margin: 16 }}>
            <button
              className="btn"
              onClick={loadMore}
              disabled={isBusy}
              type="button"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}

        {!loading && !error && !hasMore && posts.length > 0 && (
          <p className="feed-info" style={{ textAlign: "center" }}>
            You’ve reached the end.
          </p>
        )}
      </div>

      {/* Confirm delete modal */}
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
            <div className="feed-confirm-text">
              This action can’t be undone.
            </div>

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

      <PostCommentsModal
        post={commentsPost}
        isOpen={commentsPost !== null}
        onClose={closeComments}
        onCommentAdded={() => {
          if (commentsPost) {
            handleCommentAdded(commentsPost.id);
          }
        }}
      />
    </main>
  );
}
