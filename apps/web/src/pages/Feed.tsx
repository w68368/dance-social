import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchFeed, toggleLike, type Post } from "../api";
import { FaHeart, FaRegHeart } from "react-icons/fa";
import "../styles/pages/feed.css";

export default function Feed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleToggleLike = async (postId: string) => {
    // оптимистичное обновление
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              likesCount: p.likesCount + (p.likedByMe ? -1 : 1),
              likedByMe: !p.likedByMe,
            }
          : p
      )
    );

    try {
      const res = await toggleLike(postId);
      if (res.data.ok) {
        const { likesCount, liked } = res.data;
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, likesCount, likedByMe: liked } : p
          )
        );
      }
    } catch (err) {
      console.error(err);
      // откат, если ошибка
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                likesCount: p.likesCount + (p.likedByMe ? -1 : 1),
                likedByMe: !p.likedByMe,
              }
            : p
        )
      );
    }
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
          {posts.map((post) => (
            <article key={post.id} className="feed-card">
              {/* Header: автор → клик на профиль */}
              <header className="feed-card-header">
                <Link to="/profile" className="feed-user-link">
                  <div className="feed-user">
                    {post.author.avatarUrl ? (
                      <img
                        src={post.author.avatarUrl}
                        alt={post.author.username}
                        className="feed-avatar"
                      />
                    ) : (
                      <div className="feed-avatar-placeholder">
                        {post.author.username.slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <div>
                      <div className="feed-username">
                        {post.author.username}
                      </div>
                      <div className="feed-date">
                        {new Date(post.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </Link>
              </header>

              {/* Media сверху */}
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

              {/* Подпись */}
              {post.caption && <p className="feed-caption">{post.caption}</p>}

              {/* Лайки */}
              <div className="feed-footer">
                <button
                  className={`like-btn ${post.likedByMe ? "liked" : ""}`}
                  onClick={() => handleToggleLike(post.id)}
                >
                  {post.likedByMe ? (
                    <FaHeart className="like-icon" />
                  ) : (
                    <FaRegHeart className="like-icon" />
                  )}

                  {/* просто число */}
                  <span className="like-count">{post.likesCount}</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
