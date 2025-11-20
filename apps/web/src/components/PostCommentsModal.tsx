import { useEffect, useRef, useState } from "react";
import { FaTimes, FaRegCommentDots, FaHeart, FaRegHeart } from "react-icons/fa";
import type { Post, PostComment } from "../api";
import { fetchComments, addComment } from "../api";
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
  // 🆕 id того комментария, к которому реально привязываем ответ (всегда root)
  const [replyParentId, setReplyParentId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post || !text.trim()) return;

    try {
      setSending(true);
      setError(null);

      const newComment = await addComment(
        post.id,
        text.trim(),
        replyParentId ?? undefined // 🆕 всегда отправляем id root-коммента
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

  if (!isOpen || !post) return null;

  const createdAt = new Date(post.createdAt);

  // сгруппируем комментарии: родитель -> список ответов
  const roots = comments.filter((c) => !c.parentId);
  const repliesByParent = new Map<string, PostComment[]>();
  comments.forEach((c) => {
    if (c.parentId) {
      const list = repliesByParent.get(c.parentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentId, list);
    }
  });

  // 🆕 старт ответа: если коммент уже ответ (есть parentId) —
  // то родителем для нового ответа всё равно считаем root (parentId),
  // иначе — сам комментарий
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

  // подсветка @mention в тексте
  const formatTextWithMentions = (value: string) => {
    const parts = value.split(/(\s+)/); // сохраняем пробелы
    return parts.map((part, idx) => {
      if (part.startsWith("@") && part.trim().length > 1) {
        return (
          <span key={idx} className="mention">
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
                <div className="pcm-post-title">{post.caption || "Post"}</div>
                <div className="pcm-post-meta">
                  <span>{post.author.username}</span>
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
                  {roots.map((c) => {
                    const replies = repliesByParent.get(c.id) ?? [];
                    return (
                      <li key={c.id} className="pcm-item">
                        <div className="pcm-avatar">
                          {c.author.avatarUrl ? (
                            <img
                              src={c.author.avatarUrl}
                              alt={c.author.username}
                            />
                          ) : (
                            <div className="pcm-avatar-fallback">
                              {c.author.username[0]?.toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="pcm-body">
                          <div className="pcm-meta">
                            <span className="pcm-username">
                              {c.author.username}
                            </span>
                            {isPostAuthor(c) && (
                              <span className="pcm-author-badge">Автор</span>
                            )}
                          </div>
                          <div className="pcm-text">
                            {formatTextWithMentions(c.text)}
                          </div>
                          <button
                            type="button"
                            className="pcm-reply-btn"
                            onClick={() => startReply(c)}
                          >
                            Ответить
                          </button>

                          {replies.length > 0 && (
                            <ul className="pcm-replies">
                              {replies.map((r) => (
                                <li
                                  key={r.id}
                                  className="pcm-item pcm-item-reply"
                                >
                                  <div className="pcm-avatar pcm-avatar-reply">
                                    {r.author.avatarUrl ? (
                                      <img
                                        src={r.author.avatarUrl}
                                        alt={r.author.username}
                                      />
                                    ) : (
                                      <div className="pcm-avatar-fallback">
                                        {r.author.username[0]?.toUpperCase()}
                                      </div>
                                    )}
                                  </div>
                                  <div className="pcm-body">
                                    <div className="pcm-meta">
                                      <span className="pcm-username">
                                        {r.author.username}
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
                                    <button
                                      type="button"
                                      className="pcm-reply-btn"
                                      onClick={() => startReply(r)}
                                    >
                                      Ответить
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Форма + лайки снизу */}
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
