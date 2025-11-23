// apps/web/src/components/PostCommentsModal.tsx
import type React from "react";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  FaTimes,
  FaRegCommentDots,
  FaHeart,
  FaRegHeart,
  FaEdit,
  FaTrash,
  FaEllipsisH,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import type {
  Post,
  PostComment,
  ApiUserSummary,
  CommentSortMode,
} from "../api";
import {
  fetchComments,
  addComment,
  toggleCommentLike,
  togglePinComment,
  editComment,
  deleteComment,
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

  // пагинация
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // режим сортировки
  const [sortMode, setSortMode] = useState<CommentSortMode>("best");

  // ответ на конкретный комментарий (для подсказки + @ник)
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  // id того комментария, к которому реально привязываем ответ (всегда root)
  const [replyParentId, setReplyParentId] = useState<string | null>(null);

  // редактирование комментария
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingSending, setEditingSending] = useState(false);

  // какие треды (root-комменты) свёрнуты
  const [collapsedThreads, setCollapsedThreads] = useState<
    Record<string, boolean>
  >({});

  // 🔒 анти-флуд
  const [lastSendAt, setLastSendAt] = useState<number | null>(null);
  const [lastText, setLastText] = useState<string>("");

  // кастомный тост
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // кастомный диалог удаления
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteSending, setDeleteSending] = useState(false);

  // открытое меню "три точки" для конкретного комментария
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const me = getUser();
  const isPostOwner = !!(me && post && me.id === post.author.id);

  const toggleMenuFor = (commentId: string) => {
    setOpenMenuFor((prev) => (prev === commentId ? null : commentId));
  };

  // форматирование времени
  const formatRelativeTime = (iso: string) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return "только что";
    if (diffMin < 60) return `${diffMin} мин назад`;
    if (diffHours < 24) return `${diffHours} ч назад`;
    if (diffDays === 1) return "вчера";
    if (diffDays < 7) return `${diffDays} дн назад`;
    return date.toLocaleDateString();
  };

  // загрузка первой страницы комментариев (при открытии и смене sortMode)
  useEffect(() => {
    if (!isOpen || !post) return;

    let alive = true;
    setLoading(true);
    setError(null);
    setComments([]);
    setNextCursor(null);
    setReplyTo(null);
    setReplyParentId(null);
    setEditingId(null);
    setEditingText("");
    setToast(null);
    setDeleteTargetId(null);
    setCollapsedThreads({});
    setLastSendAt(null);
    setLastText("");
    setOpenMenuFor(null);

    fetchComments(post.id, null, 20, sortMode)
      .then((page) => {
        if (!alive) return;
        setComments(page.comments);
        setNextCursor(page.nextCursor);
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
  }, [isOpen, post?.id, sortMode]);

  // авто-скрытие тоста
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(id);
  }, [toast]);

  // догрузка следующей страницы
  const handleLoadMore = async () => {
    if (!post || !nextCursor || loadingMore) return;

    setLoadingMore(true);
    try {
      const page = await fetchComments(post.id, nextCursor, 20, sortMode);

      setComments((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const merged = [...prev];
        for (const c of page.comments) {
          if (!existingIds.has(c.id)) {
            merged.push(c);
          }
        }
        return merged;
      });

      setNextCursor(page.nextCursor);
    } catch (e) {
      console.error("Failed to load more comments", e);
    } finally {
      setLoadingMore(false);
    }
  };

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
    if (!post) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    // 🔒 анти-флуд: не чаще, чем раз в 4 секунды
    const now = Date.now();
    if (lastSendAt && now - lastSendAt < 4000) {
      setToast({
        type: "error",
        message: "Слишком часто 😅 Подожди пару секунд.",
      });
      return;
    }

    // 🔒 анти-флуд: не спамить одним и тем же текстом подряд
    if (lastText && trimmed === lastText) {
      setToast({
        type: "error",
        message: "Точно такой же комментарий уже отправлен.",
      });
      return;
    }

    try {
      setSending(true);
      setError(null);

      const newComment = await addComment(
        post.id,
        trimmed,
        replyParentId ?? undefined
      );

      setComments((prev) => [...prev, newComment]);
      setText("");
      setReplyTo(null);
      setReplyParentId(null);
      setLastSendAt(now);
      setLastText(trimmed);
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

  // редактирование
  const startEdit = (c: PostComment) => {
    if (!me || c.author.id !== me.id) return;
    setEditingId(c.id);
    setEditingText(c.text);
    setReplyTo(null);
    setReplyParentId(null);
    setOpenMenuFor(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
    setEditingSending(false);
    setOpenMenuFor(null);
  };

  const submitEdit = async (commentId: string) => {
    if (!editingText.trim()) return;

    try {
      setEditingSending(true);
      const updated = await editComment(commentId, editingText.trim());

      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? updated : c))
      );
      cancelEdit();
      setToast({ type: "success", message: "Комментарий обновлён" });
    } catch (e) {
      console.error("Failed to edit comment", e);
      setToast({
        type: "error",
        message: "Не удалось обновить комментарий",
      });
    } finally {
      setEditingSending(false);
    }
  };

  // открыть кастомное подтверждение удаления
  const openDeleteConfirm = (commentId: string) => {
    setDeleteTargetId(commentId);
    setOpenMenuFor(null);
  };

  const cancelDeleteConfirm = () => {
    if (deleteSending) return;
    setDeleteTargetId(null);
    setOpenMenuFor(null);
  };

  // выполняем удаление после подтверждения
  const handleDeleteComment = async (commentId: string) => {
    try {
      setDeleteSending(true);
      await deleteComment(commentId);

      setComments((prev) =>
        prev.filter((c) => c.id !== commentId && c.parentId !== commentId)
      );
      if (editingId === commentId) {
        cancelEdit();
      }
      setToast({ type: "success", message: "Комментарий удалён" });
    } catch (e) {
      console.error("Failed to delete comment", e);
      setToast({
        type: "error",
        message: "Не удалось удалить комментарий",
      });
    } finally {
      setDeleteSending(false);
      setDeleteTargetId(null);
      setOpenMenuFor(null);
    }
  };

  // сворачивание / разворачивание треда
  const toggleThreadCollapsed = (rootId: string) => {
    setCollapsedThreads((prev) => ({
      ...prev,
      [rootId]: !prev[rootId],
    }));
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
    setEditingId(null);
    setEditingText("");
    setOpenMenuFor(null);

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
            {/* Тост-уведомление */}
            {toast && (
              <div
                className={`pcm-toast ${
                  toast.type === "success"
                    ? "pcm-toast--success"
                    : "pcm-toast--error"
                }`}
              >
                {toast.message}
              </div>
            )}

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
                <>
                  {/* Переключатель сортировки */}
                  <div className="pcm-sort">
                    <button
                      type="button"
                      className={`pcm-sort-button ${
                        sortMode === "best" ? "active" : ""
                      }`}
                      onClick={() => setSortMode("best")}
                    >
                      Лучшие
                    </button>
                    <button
                      type="button"
                      className={`pcm-sort-button ${
                        sortMode === "new" ? "active" : ""
                      }`}
                      onClick={() => setSortMode("new")}
                    >
                      Новые
                    </button>
                    <button
                      type="button"
                      className={`pcm-sort-button ${
                        sortMode === "old" ? "active" : ""
                      }`}
                      onClick={() => setSortMode("old")}
                    >
                      Старые
                    </button>
                  </div>

                  <div className="comments-list-wrapper">
                    <ul className="pcm-list comments-list">
                      {[...pinnedRoots, ...regularRoots].map((c) => {
                        const replies = repliesByParent.get(c.id) ?? [];
                        const rootAuthorName =
                          c.author.displayName || c.author.username;

                        const isOwnRoot = me && c.author.id === me.id;
                        const isCollapsed = collapsedThreads[c.id] ?? false;
                        const isEdited =
                          !!c.updatedAt &&
                          c.updatedAt !== c.createdAt &&
                          new Date(c.updatedAt).getTime() >
                            new Date(c.createdAt).getTime();

                        return (
                          <li
                            key={c.id}
                            className={
                              "pcm-item" +
                              (c.isPinned ? " pcm-item--pinned" : "")
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
                              {/* верхняя строка: имя + бейджи слева, время + меню справа */}
                              <div className="pcm-row-top">
                                <div className="pcm-meta">
                                  <span className="pcm-username">
                                    {rootAuthorName}
                                  </span>
                                  {isPostAuthor(c) && (
                                    <span className="pcm-author-badge">
                                      Автор
                                    </span>
                                  )}
                                  {c.isPinned && (
                                    <span className="pcm-pinned-badge">
                                      Закреплён
                                    </span>
                                  )}
                                </div>

                                <div className="pcm-row-top-right">
                                  <span className="pcm-time">
                                    {formatRelativeTime(c.createdAt)}
                                  </span>
                                  {isEdited && (
                                    <span className="pcm-edited">
                                      · изменено
                                    </span>
                                  )}

                                  {isOwnRoot && (
                                    <div className="pcm-comment-menu-wrapper">
                                      <button
                                        type="button"
                                        className="pcm-comment-menu-trigger"
                                        onClick={() => toggleMenuFor(c.id)}
                                        aria-label="Меню комментария"
                                      >
                                        <FaEllipsisH />
                                      </button>

                                      {openMenuFor === c.id && (
                                        <div className="pcm-comment-menu">
                                          <button
                                            type="button"
                                            className="pcm-comment-menu-item"
                                            onClick={() => startEdit(c)}
                                          >
                                            <FaEdit />
                                            <span>Редактировать</span>
                                          </button>
                                          <button
                                            type="button"
                                            className="pcm-comment-menu-item pcm-comment-menu-item-danger"
                                            onClick={() =>
                                              openDeleteConfirm(c.id)
                                            }
                                          >
                                            <FaTrash />
                                            <span>Удалить</span>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Текст или режим редактирования */}
                              {editingId === c.id ? (
                                <div className="pcm-edit-block">
                                  <input
                                    className="pcm-edit-input"
                                    type="text"
                                    value={editingText}
                                    maxLength={500}
                                    onChange={(e) =>
                                      setEditingText(e.target.value)
                                    }
                                    autoFocus
                                  />
                                  <div className="pcm-edit-actions">
                                    <button
                                      type="button"
                                      className="pcm-edit-save"
                                      disabled={
                                        editingSending || !editingText.trim()
                                      }
                                      onClick={() => submitEdit(c.id)}
                                    >
                                      Сохранить
                                    </button>
                                    <button
                                      type="button"
                                      className="pcm-edit-cancel"
                                      onClick={cancelEdit}
                                      disabled={editingSending}
                                    >
                                      Отмена
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="pcm-text">
                                  {formatTextWithMentions(c.text)}
                                </div>
                              )}

                              {/* нижняя строка: Ответить слева, лайк + закрепить справа */}
                              <div className="pcm-row-bottom">
                                <button
                                  type="button"
                                  className="pcm-reply-inline"
                                  onClick={() => startReply(c)}
                                >
                                  Ответить
                                </button>

                                <div className="pcm-row-bottom-right">
                                  <button
                                    type="button"
                                    className={`pcm-comment-like-btn ${
                                      c.likedByMe
                                        ? "pcm-comment-like-btn--active"
                                        : ""
                                    }`}
                                    onClick={() =>
                                      handleToggleCommentLike(c.id)
                                    }
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
                                      className="pcm-pin-link"
                                      onClick={() => handleTogglePin(c.id)}
                                    >
                                      {c.isPinned ? "Открепить" : "Закрепить"}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Тогглер треда, если есть ответы */}
                              {replies.length > 0 && (
                                <div className="pcm-thread-toggle-row">
                                  <button
                                    type="button"
                                    className="pcm-thread-toggle-btn"
                                    onClick={() => toggleThreadCollapsed(c.id)}
                                  >
                                    {isCollapsed
                                      ? `Показать ответы (${replies.length})`
                                      : `Скрыть ответы (${replies.length})`}
                                  </button>
                                </div>
                              )}

                              {/* Ответы */}
                              {replies.length > 0 && !isCollapsed && (
                                <ul className="pcm-replies">
                                  {replies.map((r) => {
                                    const replyAuthorName =
                                      r.author.displayName || r.author.username;
                                    const isOwnReply =
                                      me && r.author.id === me.id;

                                    const replyEdited =
                                      !!r.updatedAt &&
                                      r.updatedAt !== r.createdAt &&
                                      new Date(r.updatedAt).getTime() >
                                        new Date(r.createdAt).getTime();

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
                                          {/* верхняя строка ответа */}
                                          <div className="pcm-row-top">
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

                                            <div className="pcm-row-top-right">
                                              <span className="pcm-time">
                                                {formatRelativeTime(
                                                  r.createdAt
                                                )}
                                              </span>
                                              {replyEdited && (
                                                <span className="pcm-edited">
                                                  · изменено
                                                </span>
                                              )}

                                              {isOwnReply && (
                                                <div className="pcm-comment-menu-wrapper">
                                                  <button
                                                    type="button"
                                                    className="pcm-comment-menu-trigger"
                                                    onClick={() =>
                                                      toggleMenuFor(r.id)
                                                    }
                                                    aria-label="Меню комментария"
                                                  >
                                                    <FaEllipsisH />
                                                  </button>

                                                  {openMenuFor === r.id && (
                                                    <div className="pcm-comment-menu">
                                                      <button
                                                        type="button"
                                                        className="pcm-comment-menu-item"
                                                        onClick={() =>
                                                          startEdit(r)
                                                        }
                                                      >
                                                        <FaEdit />
                                                        <span>
                                                          Редактировать
                                                        </span>
                                                      </button>
                                                      <button
                                                        type="button"
                                                        className="pcm-comment-menu-item pcm-comment-menu-item-danger"
                                                        onClick={() =>
                                                          openDeleteConfirm(
                                                            r.id
                                                          )
                                                        }
                                                      >
                                                        <FaTrash />
                                                        <span>Удалить</span>
                                                      </button>
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          </div>

                                          {/* текст / редактирование */}
                                          {editingId === r.id ? (
                                            <div className="pcm-edit-block">
                                              <input
                                                className="pcm-edit-input"
                                                type="text"
                                                value={editingText}
                                                maxLength={500}
                                                onChange={(e) =>
                                                  setEditingText(e.target.value)
                                                }
                                                autoFocus
                                              />
                                              <div className="pcm-edit-actions">
                                                <button
                                                  type="button"
                                                  className="pcm-edit-save"
                                                  disabled={
                                                    editingSending ||
                                                    !editingText.trim()
                                                  }
                                                  onClick={() =>
                                                    submitEdit(r.id)
                                                  }
                                                >
                                                  Сохранить
                                                </button>
                                                <button
                                                  type="button"
                                                  className="pcm-edit-cancel"
                                                  onClick={cancelEdit}
                                                  disabled={editingSending}
                                                >
                                                  Отмена
                                                </button>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="pcm-text">
                                              {formatTextWithMentions(r.text)}
                                            </div>
                                          )}

                                          {/* низ ответа: Ответить + лайк справа */}
                                          <div className="pcm-row-bottom">
                                            <button
                                              type="button"
                                              className="pcm-reply-inline"
                                              onClick={() => startReply(r)}
                                            >
                                              Ответить
                                            </button>

                                            <div className="pcm-row-bottom-right">
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

                    {nextCursor && (
                      <div className="comments-more">
                        <div className="comments-gradient-bottom" />
                        <button
                          type="button"
                          className="comments-more-button"
                          onClick={handleLoadMore}
                          disabled={loadingMore}
                        >
                          {loadingMore ? "Загружаем…" : "Показать ещё"}
                        </button>
                      </div>
                    )}
                  </div>
                </>
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

          {/* Кастомный диалог подтверждения удаления */}
          {deleteTargetId && (
            <div className="pcm-confirm-backdrop">
              <div className="pcm-confirm">
                <div className="pcm-confirm-title">Удалить комментарий?</div>
                <div className="pcm-confirm-text">
                  Это действие нельзя отменить.
                </div>
                <div className="pcm-confirm-actions">
                  <button
                    type="button"
                    className="pcm-confirm-delete"
                    onClick={() => handleDeleteComment(deleteTargetId)}
                    disabled={deleteSending}
                  >
                    {deleteSending ? "Удаляем…" : "Да, удалить"}
                  </button>
                  <button
                    type="button"
                    className="pcm-confirm-cancel"
                    onClick={cancelDeleteConfirm}
                    disabled={deleteSending}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
