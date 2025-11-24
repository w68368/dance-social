import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  fetchFeed,
  toggleLike,
  reactToPost,
  fetchPostReactions,
  type Post,
  type ReactionType,
  type PostReactionsSummary,
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

// конфиг реакций для поповера
const REACTIONS: { type: ReactionType; icon: ReactNode; label: string }[] = [
  { type: "LIKE", icon: <FaHeart />, label: "Like" },
  { type: "FIRE", icon: <FaFire />, label: "Fire" },
  { type: "WOW", icon: <FaStar />, label: "Wow" },
  { type: "CUTE", icon: <FaFaceSmileBeam />, label: "Cute" },
  { type: "CLAP", icon: <FaHandsClapping />, label: "Clap" },
];

// иконка, которая показывается на основной кнопке
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
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // модалка комментариев
  const [commentsPost, setCommentsPost] = useState<Post | null>(null);

  // сводка реакций по постам: postId -> summary
  const [reactionsMap, setReactionsMap] = useState<
    Record<string, PostReactionsSummary>
  >({});

  const me = getUser();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetchFeed();
        if (!cancelled) setPosts(res.data.posts);
      } catch (err: any) {
        console.error(err);
        if (!cancelled) {
          setError(
            err?.response?.data?.message || "Не удалось загрузить ленту."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // общая функция: применяем summary к посту + кладём его в reactionsMap
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

  // лениво подгружаем сводку реакций при первом наведении
  const ensureReactionsLoaded = async (postId: string) => {
    if (reactionsMap[postId]) return;
    try {
      const summary = await fetchPostReactions(postId);
      applyReactionsSummary(postId, summary);
    } catch (err) {
      console.error("Failed to load reactions", err);
    }
  };

  // быстрый лайк по кнопке (LIKE)
  const handleToggleLike = async (postId: string) => {
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
      // откат
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

  // выбор конкретной реакции из поповера
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

  return (
    <main className="su-main">
      <div className="container feed-container">
        <h1 className="page-title feed-title">Feed</h1>

        {loading && <p className="feed-info">Загружаем посты...</p>}
        {error && <p className="feed-error">{error}</p>}

        {!loading && !error && posts.length === 0 && (
          <p className="feed-empty">
            В ленте пока нет постов. Попробуй опубликовать что-нибудь через{" "}
            <strong>Add post</strong>.
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
                    >
                      {mainIcon}
                      <span className="like-count">{post.likesCount}</span>
                    </button>
                  </div>

                  <button
                    className="comment-btn"
                    onClick={() => openComments(post)}
                  >
                    <FaRegCommentDots className="comment-icon" />
                    <span className="comment-count">{post.commentsCount}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

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
