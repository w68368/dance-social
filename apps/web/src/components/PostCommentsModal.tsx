import { useEffect, useRef, useState, useMemo } from "react";
import { FaTimes, FaRegCommentDots, FaHeart, FaRegHeart } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import type { Post, PostComment, ApiUserSummary } from "../api";
import {
  fetchComments,
  addComment,
  toggleCommentLike,
  togglePinComment,
} from "../api";
import { getUser } from "../lib/auth";
import "../styles/components/comments-modal.css";

interface PostCommentsModalProps {
  post: Post | null;
  isOpen: boolean;
  onClose: () => void;
  onCommentAdded?: () => void;
}

export default function PostCommentsModal({
  post,
  isOpen,
  onClose,
  onCommentAdded,
}: PostCommentsModalProps) {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");

  // ответ на конкретный комментарий (для подсказки + @ник)
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  // id того комментария, к которому реально привязываем ответ (всегда root)
  const [replyParentId, setReplyParentId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const me = getUser();
  const isPostOwner = !!(me && post && me.id === post.author.id);

  // загрузка комментариев
  useEffect(() => {
    if (!isOpen || !post) return;

    let alive = true;
    setLoading(true);
    setError(null);

    fetchComments(post.id)
      .then((list) => {
        if (!alive) return;
        setComments(list);
      })
      .catch(() => {
        if (!alive) return;
        setError("Не удалось загрузить комментарии");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [isOpen, post?.id]);

  // фокус на поле ввода при выборе "Ответить"
  useEffect(() => {
    if (replyTo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [replyTo]);

  // карта username → пользователь (для навигации по @)
  const usersByUsername = useMemo(() => {
    const map = new Map<string, ApiUserSummary>();

    if (post?.author) {
      map.set(post.author.username.toLowerCase(), post.author);
    }

    comments.forEach((c) => {
      map.set(c.author.username.toLowerCase(), c.author);
    });

    if (me) {
      map.set(me.username.toLowerCase(), {
        id: me.id,
        username: me.username,
        displayName: me.displayName,
        avatarUrl: me.avatarUrl,
      });
    }

    return map;
  }, [post, comments, me]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post || !text.trim()) return;

    try {
      setSending(true);
      setError(null);

      const newComment = await addComment(
        post.id,
        text.trim(),
        replyParentId ?? undefined
      );

      setComments((prev) => [...prev, newComment]);
      setText("");
      setReplyTo(null);
      setReplyParentId(null);
      onCommentAdded?.();
    } catch {
      setError("Не удалось отправить комментарий");
    } finally {
      setSending(false);
    }
  };

  const handleToggleCommentLike = async (commentId: string) => {
    // оптимистичное обновление
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? {
              ...c,
              likedByMe: !c.likedByMe,
              likesCount: c.likesCount + (c.likedByMe ? -1 : 1),
            }
          : c
      )
    );

    try {
      const { data } = await toggleCommentLike(commentId);
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, likedByMe: data.liked, likesCount: data.likesCount }
            : c
        )
      );
    } catch {
      // если ошибка — откатим
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? {
                ...c,
                likedByMe: !c.likedByMe,
                likesCount: c.likesCount + (c.likedByMe ? -1 : 1),
              }
            : c
        )
      );
    }
  };

  const handleTogglePin = async (commentId: string) => {
    if (!post || !isPostOwner) return;
    try {
      const { data } = await togglePinComment(post.id, commentId);
      const pinnedId = data.pinnedCommentId;

      setComments((prev) =>
        prev.map((c) => ({
          ...c,
          isPinned: pinnedId ? c.id === pinnedId : false,
        }))
      );
    } catch {
      // можно добавить показ ошибки, если нужно
    }
  };

  if (!isOpen || !post) return null;

  const createdAt = new Date(post.createdAt);
  const postAuthorName = post.author.displayName || post.author.username;

  // сгруппируем комментарии: родитель -> список ответов
  const roots = comments.filter((c) => !c.parentId);
  const pinnedRoots = roots.filter((c) => c.isPinned);
  const regularRoots = roots.filter((c) => !c.isPinned);

  const repliesByParent = new Map<string, PostComment[]>();
  comments.forEach((c) => {
    if (c.parentId) {
      const list = repliesByParent.get(c.parentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentId, list);
    }
  });

  // старт ответа
  const startReply = (c: PostComment) => {
    const parentId = c.parentId ?? c.id; // root для треда
    setReplyTo(c);
    setReplyParentId(parentId);

    if (!text.startsWith(`@${c.author.username}`)) {
      setText(`@${c.author.username} `);
    }
  };

  const cancelReply = () => {
    setReplyTo(null);
    setReplyParentId(null);
  };

  // подсветка и кликабельность @mention
  const formatTextWithMentions = (value: string) => {
    const parts = value.split(/(\s+)/); // сохраняем пробелы
    return parts.map((part, idx) => {
      if (part.startsWith("@") && part.trim().length > 1) {
        const raw = part.trim();
        const usernameSlug = raw
          .slice(1)
          .replace(/[^a-zA-Z0-9_.-].*$/, "")
          .toLowerCase();
        const user = usersByUsername.get(usernameSlug);

        const handleClick = () => {
          if (!user) return;
          if (me && user.id === me.id) {
            navigate("/profile");
          } else {
            navigate(`/users/${user.id}`);
          }
        };

        return (
          <span key={idx} className="mention" onClick={handleClick}>
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const isPostAuthor = (comment: PostComment) =>
    comment.author.id === post.author.id;

  return (
    <div className="pcm-backdrop" onClick={onClose}>
      <div className="pcm-modal" onClick={(e) => e.stopPropagation()}>
        {/* Левая часть — медиа */}
        <div className="pcm-media-pane">
          {post.mediaType === "image" && post.mediaUrl && (
            <img src={post.mediaUrl} alt="post media" />
          )}
          {post.mediaType === "video" && post.mediaUrl && (
            <video src={post.mediaUrl} controls />
          )}
        </div>

        {/* Правая часть — инфо + комментарии */}
        <div className="pcm-side-pane">
          <header className="pcm-header">
            <div className="pcm-header-left">
              <FaRegCommentDots className="pcm-header-icon" />
              <div className="pcm-header-text">
                <div className="pcm-post-title">
                  {post.caption ? formatTextWithMentions(post.caption) : "Post"}
                </div>
                <div className="pcm-post-meta">
                  <span>{postAuthorName}</span>
                  <span>•</span>
                  <span>{createdAt.toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            <button className="pcm-close" onClick={onClose}>
              <FaTimes />
            </button>
          </header>

          <div className="pcm-content">
            {/* Список комментариев */}
            <div className="pcm-comments-block">
              {loading ? (
                <div className="pcm-status">Загружаем комментарии…</div>
              ) : error ? (
                <div className="pcm-status pcm-error">{error}</div>
              ) : roots.length === 0 ? (
                <div className="pcm-status pcm-empty">
                  Пока нет комментариев — стань первым ✨
                </div>
              ) : (
                <ul className="pcm-list">
                  {[...pinnedRoots, ...regularRoots].map((c) => {
                    const replies = repliesByParent.get(c.id) ?? [];
                    const rootAuthorName =
                      c.author.displayName || c.author.username;

                    return (
                      <li
                        key={c.id}
                        className={
                          "pcm-item" + (c.isPinned ? " pcm-item--pinned" : "")
                        }
                      >
                        <div className="pcm-avatar">
                          {c.author.avatarUrl ? (
                            <img
                              src={c.author.avatarUrl}
                              alt={rootAuthorName}
                            />
                          ) : (
                            <div className="pcm-avatar-fallback">
                              {rootAuthorName[0]?.toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="pcm-body">
                          <div className="pcm-meta">
                            <span className="pcm-username">
                              {rootAuthorName}
                            </span>
                            {isPostAuthor(c) && (
                              <span className="pcm-author-badge">Автор</span>
                            )}
                            {c.isPinned && (
                              <span className="pcm-pinned-badge">
                                Закреплён
                              </span>
                            )}
                          </div>
                          <div className="pcm-text">
                            {formatTextWithMentions(c.text)}
                          </div>
                          <div className="pcm-comment-actions">
                            <button
                              type="button"
                              className="pcm-reply-btn"
                              onClick={() => startReply(c)}
                            >
                              Ответить
                            </button>
                            <button
                              type="button"
                              className={`pcm-comment-like-btn ${
                                c.likedByMe
                                  ? "pcm-comment-like-btn--active"
                                  : ""
                              }`}
                              onClick={() => handleToggleCommentLike(c.id)}
                            >
                              {c.likedByMe ? (
                                <FaHeart className="pcm-comment-like-icon pcm-comment-like-icon--active" />
                              ) : (
                                <FaRegHeart className="pcm-comment-like-icon" />
                              )}
                              <span className="pcm-comment-like-count">
                                {c.likesCount}
                              </span>
                            </button>

                            {isPostOwner && !c.parentId && (
                              <button
                                type="button"
                                className="pcm-pin-btn"
                                onClick={() => handleTogglePin(c.id)}
                              >
                                {c.isPinned ? "Открепить" : "Закрепить"}
                              </button>
                            )}
                          </div>

                          {replies.length > 0 && (
                            <ul className="pcm-replies">
                              {replies.map((r) => {
                                const replyAuthorName =
                                  r.author.displayName || r.author.username;

                                return (
                                  <li
                                    key={r.id}
                                    className="pcm-item pcm-item-reply"
                                  >
                                    <div className="pcm-avatar pcm-avatar-reply">
                                      {r.author.avatarUrl ? (
                                        <img
                                          src={r.author.avatarUrl}
                                          alt={replyAuthorName}
                                        />
                                      ) : (
                                        <div className="pcm-avatar-fallback">
                                          {replyAuthorName[0]?.toUpperCase()}
                                        </div>
                                      )}
                                    </div>
                                    <div className="pcm-body">
                                      <div className="pcm-meta">
                                        <span className="pcm-username">
                                          {replyAuthorName}
                                        </span>
                                        {isPostAuthor(r) && (
                                          <span className="pcm-author-badge">
                                            Автор
                                          </span>
                                        )}
                                      </div>
                                      <div className="pcm-text">
                                        {formatTextWithMentions(r.text)}
                                      </div>
                                      <div className="pcm-comment-actions">
                                        <button
                                          type="button"
                                          className="pcm-reply-btn"
                                          onClick={() => startReply(r)}
                                        >
                                          Ответить
                                        </button>
                                        <button
                                          type="button"
                                          className={`pcm-comment-like-btn ${
                                            r.likedByMe
                                              ? "pcm-comment-like-btn--active"
                                              : ""
                                          }`}
                                          onClick={() =>
                                            handleToggleCommentLike(r.id)
                                          }
                                        >
                                          {r.likedByMe ? (
                                            <FaHeart className="pcm-comment-like-icon pcm-comment-like-icon--active" />
                                          ) : (
                                            <FaRegHeart className="pcm-comment-like-icon" />
                                          )}
                                          <span className="pcm-comment-like-count">
                                            {r.likesCount}
                                          </span>
                                        </button>
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Форма + лайки поста снизу */}
            <div className="pcm-bottom">
              {replyTo && (
                <div className="pcm-replying-to">
                  <span>
                    Ответ на <strong>@{replyTo.author.username}</strong>
                  </span>
                  <button
                    type="button"
                    className="pcm-replying-cancel"
                    onClick={cancelReply}
                  >
                    ×
                  </button>
                </div>
              )}

              <form className="pcm-form" onSubmit={handleSubmit}>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Напиши комментарий…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={500}
                />
                <button type="submit" disabled={sending || !text.trim()}>
                  {sending ? "Отправляем…" : "Отправить"}
                </button>
              </form>

              <div className="pcm-likes-row">
                {post.likedByMe ? (
                  <FaHeart className="pcm-like-icon pcm-like-icon--active" />
                ) : (
                  <FaRegHeart className="pcm-like-icon" />
                )}
                <span className="pcm-likes-count">{post.likesCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
