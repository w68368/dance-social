// apps/web/src/pages/Chats.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchConversations,
  fetchConversationMessages,
  openDm,
  sendConversationMessage,
  sendConversationMedia, // ✅ media
  deleteChatMessage,
  editConversationMessage,
  type ChatConversationListItem,
  type ChatMessage,
  type ChatPeer,
} from "../api";
import { getUser } from "../lib/auth";
import "../styles/pages/chats.css";

// ✅ react-icons
import {
  FiMoreHorizontal,
  FiPaperclip,
  FiSend,
  FiX,
  FiTrash2,
  FiEdit2,
  FiCornerUpLeft,
  FiRefreshCcw,
} from "react-icons/fi";

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function clip(s: string, n = 80) {
  const t = (s || "").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + "…";
}

/**
 * ✅ We keep the imported ChatMessage, but the server may return different fields for media:
 * - mediaUrl/mediaType
 * - imageUrl/videoUrl
 * - fileUrl/fileType
 *
 * This UI type allows any of them.
 */
type MessageVM = ChatMessage & {
  editedAt?: string | null;
  replyToId?: string | null;
  replyTo?: any | null;

  mediaUrl?: string | null;
  mediaType?: "image" | "video" | null;

  imageUrl?: string | null;
  videoUrl?: string | null;

  fileUrl?: string | null;
  fileType?: "image" | "video" | null;
};

/** ✅ Universal media extractor (works with any backend shape) */
function extractMedia(m: any): { url: string | null; type: "image" | "video" | null } {
  if (!m) return { url: null, type: null };

  // preferred fields
  if (typeof m.mediaUrl === "string" && m.mediaUrl) {
    const t = m.mediaType === "image" || m.mediaType === "video" ? m.mediaType : null;
    return { url: m.mediaUrl, type: t };
  }

  // common alternates
  if (typeof m.imageUrl === "string" && m.imageUrl) return { url: m.imageUrl, type: "image" };
  if (typeof m.videoUrl === "string" && m.videoUrl) return { url: m.videoUrl, type: "video" };

  // generic file fields
  if (typeof m.fileUrl === "string" && m.fileUrl) {
    const t = m.fileType === "image" || m.fileType === "video" ? m.fileType : null;
    return { url: m.fileUrl, type: t };
  }

  // sometimes server nests media: { url, type }
  if (m.media && typeof m.media.url === "string" && m.media.url) {
    const t = m.media.type === "image" || m.media.type === "video" ? m.media.type : null;
    return { url: m.media.url, type: t };
  }

  return { url: null, type: null };
}

export default function Chats() {
  const me = getUser();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();

  const [conversations, setConversations] = useState<ChatConversationListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activePeer, setActivePeer] = useState<ChatPeer | null>(null);

  const [messages, setMessages] = useState<MessageVM[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // ✅ upload state
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- message menu
  const [openMsgMenuId, setOpenMsgMenuId] = useState<string | null>(null);
  const msgMenuRef = useRef<HTMLDivElement | null>(null);
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null);

  // --- edit state
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);

  // ✅ reply state
  const [replyTo, setReplyTo] = useState<MessageVM | null>(null);

  const listLoadedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeConvId) ?? null,
    [conversations, activeConvId]
  );

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // --- close message menu + edit on outside click / Esc
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (openMsgMenuId && msgMenuRef.current && !msgMenuRef.current.contains(t)) {
        setOpenMsgMenuId(null);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenMsgMenuId(null);
        if (editingMsgId) {
          setEditingMsgId(null);
          setEditValue("");
        }
        if (replyTo) setReplyTo(null);
      }
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMsgMenuId, editingMsgId, replyTo]);

  // focus edit input when start editing
  useEffect(() => {
    if (editingMsgId) {
      setTimeout(() => {
        editInputRef.current?.focus();
        const el = editInputRef.current;
        if (el) {
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      }, 0);
    }
  }, [editingMsgId]);

  // --- load conversations list
  const loadList = async () => {
    try {
      setLoadingList(true);
      setListError(null);
      const items = await fetchConversations();
      setConversations(items);
    } catch (e: any) {
      setListError(e?.message || "Failed to load chats.");
    } finally {
      setLoadingList(false);
      listLoadedRef.current = true;
    }
  };

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- open DM from /chats/:userId
  useEffect(() => {
    if (!userId) return;
    if (!me) return;

    (async () => {
      try {
        setChatError(null);
        const dm = await openDm(userId);
        setActiveConvId(dm.conversationId);
        setActivePeer(dm.peer);

        if (listLoadedRef.current) {
          const exists = conversations.some((c) => c.id === dm.conversationId);
          if (!exists) await loadList();
        }
      } catch (e: any) {
        setChatError(e?.message || "Failed to open dialog.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, me]);

  // --- when active conversation changes -> load messages
  useEffect(() => {
    if (!activeConvId) return;

    (async () => {
      try {
        setLoadingChat(true);
        setChatError(null);
        const { messages } = await fetchConversationMessages(activeConvId);
        setMessages((messages as any) ?? []);

        // reset ephemeral UI on chat switch
        setEditingMsgId(null);
        setEditValue("");
        setOpenMsgMenuId(null);
        setReplyTo(null);

        const fromList = conversations.find((c) => c.id === activeConvId);
        if (fromList?.peer) setActivePeer(fromList.peer);
      } catch (e: any) {
        setChatError(e?.message || "Failed to load messages.");
      } finally {
        setLoadingChat(false);
        setTimeout(scrollToBottom, 0);
      }
    })();
  }, [activeConvId, conversations]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  const selectConversation = (c: ChatConversationListItem) => {
    setActiveConvId(c.id);
    setActivePeer(c.peer ?? null);
    setMessages([]);
    setText("");
    setOpenMsgMenuId(null);
    setEditingMsgId(null);
    setEditValue("");
    setReplyTo(null);

    if (c.peer?.id) navigate(`/chats/${c.peer.id}`);
    else navigate(`/chats`);
  };

  // ✅ Reply start (for any message)
  const beginReply = (m: MessageVM) => {
    if (m.id.startsWith("tmp_")) return;
    setOpenMsgMenuId(null);
    setEditingMsgId(null);
    setEditValue("");
    setReplyTo(m);
  };
  const cancelReply = () => setReplyTo(null);

  // helper to display reply author label
  const getReplyAuthorLabel = (senderId: string) => {
    if (me && senderId === me.id) return "You";
    const peerName = activePeer?.displayName || activePeer?.username;
    return peerName || "User";
  };

  const handleSend = async () => {
    if (!activeConvId) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setSending(true);
    setChatError(null);

    const optimistic: MessageVM = {
      id: `tmp_${Date.now()}`,
      text: trimmed,
      createdAt: new Date().toISOString(),
      editedAt: null,
      senderId: me?.id || "me",
      replyToId: replyTo?.id ?? null,
      replyTo: replyTo
        ? {
            id: replyTo.id,
            text: replyTo.text,
            createdAt: replyTo.createdAt,
            senderId: replyTo.senderId,
          }
        : null,
    };

    setMessages((prev) => [...prev, optimistic]);
    setText("");
    setReplyTo(null);

    try {
      const real = (await sendConversationMessage(
        activeConvId,
        trimmed,
        optimistic.replyToId ?? null
      )) as any as MessageVM;

      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? real : m)));

      setConversations((prev) => {
        const next = prev.map((x) =>
          x.id === activeConvId
            ? {
                ...x,
                updatedAt: new Date().toISOString(),
                lastMessage: {
                  id: real.id,
                  text: real.text,
                  createdAt: real.createdAt,
                  editedAt: (real as any).editedAt ?? null,
                  senderId: real.senderId,
                },
              }
            : x
        );
        next.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
        return next;
      });
    } catch (e: any) {
      setChatError(e?.message || "Failed to send message.");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!messageId) return;
    if (deletingMsgId) return;

    if (messageId.startsWith("tmp_")) {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      setOpenMsgMenuId(null);
      return;
    }

    if (editingMsgId === messageId) {
      setEditingMsgId(null);
      setEditValue("");
    }

    setDeletingMsgId(messageId);
    setChatError(null);
    setOpenMsgMenuId(null);

    const prev = messages;
    setMessages((cur) => cur.filter((m) => m.id !== messageId));

    try {
      await deleteChatMessage(messageId);
      if (activeConvId && activeConv?.lastMessage?.id === messageId) {
        await loadList();
      }
    } catch (e: any) {
      setChatError(e?.message || "Failed to delete message.");
      setMessages(prev);
    } finally {
      setDeletingMsgId(null);
    }
  };

  const beginEdit = (m: MessageVM) => {
    if (!me) return;
    if (m.senderId !== me.id) return;
    if (m.id.startsWith("tmp_")) return;

    setOpenMsgMenuId(null);
    setReplyTo(null);
    setEditingMsgId(m.id);
    setEditValue(m.text);
  };

  const cancelEdit = () => {
    setEditingMsgId(null);
    setEditValue("");
  };

  const saveEdit = async (messageId: string) => {
    if (!messageId) return;
    if (!me) return;
    if (savingEditId) return;

    const newText = editValue.trim();
    if (!newText) return;

    const current = messages.find((x) => x.id === messageId);
    if (!current) return;
    if (current.senderId !== me.id) return;

    if (current.text === newText) {
      cancelEdit();
      return;
    }

    setSavingEditId(messageId);
    setChatError(null);

    const prev = messages;
    const nowIso = new Date().toISOString();

    setMessages((cur) =>
      cur.map((m) => (m.id === messageId ? { ...m, text: newText, editedAt: nowIso } : m))
    );

    try {
      const updated = (await editConversationMessage(messageId, newText)) as any as MessageVM;

      setMessages((cur) => cur.map((m) => (m.id === messageId ? updated : m)));

      if (activeConvId) {
        setConversations((cur) =>
          cur.map((c) => {
            if (c.id !== activeConvId) return c;
            if (!c.lastMessage || c.lastMessage.id !== messageId) return c;
            return {
              ...c,
              lastMessage: {
                id: updated.id,
                text: updated.text,
                createdAt: updated.createdAt,
                editedAt: (updated as any).editedAt ?? null,
                senderId: updated.senderId,
              },
            };
          })
        );
      }

      cancelEdit();
    } catch (e: any) {
      setChatError(e?.message || "Failed to edit message.");
      setMessages(prev);
    } finally {
      setSavingEditId(null);
    }
  };

  // ==========================
  // ✅ MEDIA SENDING
  // ==========================
  const pickMedia = () => {
    if (!activeConvId) return;
    fileInputRef.current?.click();
  };

  const handlePickFile = async (file: File) => {
    if (!activeConvId) return;

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      setChatError("Please select an image or video file.");
      return;
    }

    setUploading(true);
    setChatError(null);

    const localUrl = URL.createObjectURL(file);

    const optimistic: MessageVM = {
      id: `tmp_${Date.now()}`,
      text: text.trim(), // caption
      createdAt: new Date().toISOString(),
      editedAt: null,
      senderId: me?.id || "me",
      replyToId: replyTo?.id ?? null,
      replyTo: replyTo
        ? {
            id: replyTo.id,
            text: replyTo.text,
            createdAt: replyTo.createdAt,
            senderId: replyTo.senderId,
          }
        : null,
      mediaType: isImage ? "image" : "video",
      mediaUrl: localUrl,
    };

    setMessages((prev) => [...prev, optimistic]);
    setText("");
    setReplyTo(null);

    let realMsg: MessageVM | null = null;

    try {
      realMsg = (await sendConversationMedia(
        activeConvId,
        file,
        optimistic.text,
        optimistic.replyToId ?? null
      )) as any as MessageVM;

      // ✅ FIX: merge instead of raw replace (keeps local preview if server doesn't return url/type)
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== optimistic.id) return m;

          const serverMedia = extractMedia(realMsg);
          const optimisticMedia = extractMedia(optimistic);

          const merged: MessageVM = {
            ...optimistic,
            ...realMsg,

            // keep media visible no matter what server returns
            mediaUrl: serverMedia.url ?? optimisticMedia.url,
            mediaType: serverMedia.type ?? optimisticMedia.type,

            // also keep alternates if server uses them
            imageUrl: (realMsg as any).imageUrl ?? (optimistic as any).imageUrl ?? null,
            videoUrl: (realMsg as any).videoUrl ?? (optimistic as any).videoUrl ?? null,
            fileUrl: (realMsg as any).fileUrl ?? (optimistic as any).fileUrl ?? null,
            fileType: (realMsg as any).fileType ?? (optimistic as any).fileType ?? null,
          };

          return merged;
        })
      );

      // ✅ update list preview
      setConversations((prev) => {
        const previewText =
          (realMsg?.text && realMsg.text.trim()) ||
          (extractMedia(realMsg).type === "image" ? "📷 Photo" : extractMedia(realMsg).type === "video" ? "🎥 Video" : "Media");

        const next = prev.map((x) =>
          x.id === activeConvId
            ? {
                ...x,
                updatedAt: new Date().toISOString(),
                lastMessage: {
                  id: realMsg!.id,
                  text: previewText,
                  createdAt: realMsg!.createdAt,
                  editedAt: (realMsg as any)?.editedAt ?? null,
                  senderId: realMsg!.senderId,
                },
              }
            : x
        );

        next.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
        return next;
      });
    } catch (e: any) {
      setChatError(e?.message || "Failed to send media.");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      // cleanup local URL on failure
      try {
        URL.revokeObjectURL(localUrl);
      } catch {}
    } finally {
      setUploading(false);

      // ✅ If server returned its own url, we can revoke local blob url safely.
      // If not, keep it (so preview keeps working).
      const serverHasUrl = !!extractMedia(realMsg).url;
      if (serverHasUrl) {
        try {
          URL.revokeObjectURL(localUrl);
        } catch {}
      }
    }
  };

  return (
    <main className="su-main">
      <div className="container chats-wrap">
        {/* Left: conversations */}
        <aside className="chats-sidebar">
          <div className="chats-sidebar-header">
            <div className="chats-title">Chats</div>
            <button className="chats-refresh" type="button" onClick={loadList} title="Refresh">
              <FiRefreshCcw />
            </button>
          </div>

          {loadingList && <div className="chats-muted">Loading…</div>}
          {listError && <div className="chats-error">{listError}</div>}

          {!loadingList && !listError && conversations.length === 0 && (
            <div className="chats-empty">No chats yet.</div>
          )}

          <div className="chats-list">
            {conversations.map((c) => {
              const peer = c.peer;
              const name = peer?.displayName || peer?.username || "Unknown";
              const last = c.lastMessage?.text || "No messages yet";
              const active = c.id === activeConvId;

              return (
                <button
                  key={c.id}
                  type="button"
                  className={`chats-item ${active ? "is-active" : ""}`}
                  onClick={() => selectConversation(c)}
                >
                  <div className="chats-avatar">
                    {peer?.avatarUrl ? (
                      <img src={peer.avatarUrl} alt={name} />
                    ) : (
                      <span>{name.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="chats-item-mid">
                    <div className="chats-item-top">
                      <div className="chats-name">{name}</div>
                      <div className="chats-time">{formatTime(c.updatedAt)}</div>
                    </div>
                    <div className="chats-last">{last}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center: chat */}
        <section className="chats-main">
          {!activeConvId ? (
            <div className="chats-placeholder">
              <div className="chats-placeholder-card">
                <div className="chats-placeholder-title">Select a chat</div>
                <div className="chats-placeholder-text">
                  Choose a dialog on the left to start messaging.
                </div>
              </div>
            </div>
          ) : (
            <div className="chats-chat">
              {/* header */}
              <div className="chats-chat-header">
                <div className="chats-chat-peer">
                  <div className="chats-chat-peer-avatar">
                    {activePeer?.avatarUrl ? (
                      <img
                        src={activePeer.avatarUrl}
                        alt={activePeer.displayName || activePeer.username}
                      />
                    ) : (
                      <span>
                        {(activePeer?.displayName || activePeer?.username || "U")
                          .slice(0, 1)
                          .toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="chats-chat-peer-name">
                      {activePeer?.displayName || activePeer?.username || "Chat"}
                    </div>
                    {activePeer?.username && (
                      <div className="chats-chat-peer-handle">@{activePeer.username}</div>
                    )}
                  </div>
                </div>

                {activePeer?.id && (
                  <button
                    type="button"
                    className="chats-profile-btn"
                    onClick={() => navigate(`/users/${activePeer.id}`)}
                  >
                    Profile
                  </button>
                )}
              </div>

              {/* messages */}
              <div className="chats-messages">
                {loadingChat && <div className="chats-muted">Loading messages…</div>}
                {chatError && <div className="chats-error">{chatError}</div>}

                {!loadingChat &&
                  !chatError &&
                  messages.map((m) => {
                    const mine = !!me && m.senderId === me.id;
                    const menuOpen = openMsgMenuId === m.id;
                    const canMenu = !m.id.startsWith("tmp_");
                    const isEditing = editingMsgId === m.id;
                    const isSaving = savingEditId === m.id;
                    const reply = (m as any).replyTo ?? null;

                    const media = extractMedia(m);

                    return (
                      <div key={m.id} className={`msg ${mine ? "msg--mine" : "msg--theirs"}`}>
                        {/* ✅ menu near bubble */}
                        {canMenu && !isEditing && (
                          <div
                            className={`msg-more ${menuOpen ? "is-open" : ""}`}
                            ref={(el) => {
                              if (menuOpen) msgMenuRef.current = el;
                            }}
                          >
                            <button
                              type="button"
                              className="msg-more-btn"
                              aria-label="Message menu"
                              aria-haspopup="menu"
                              aria-expanded={menuOpen}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMsgMenuId((cur) => (cur === m.id ? null : m.id));
                              }}
                            >
                              <FiMoreHorizontal />
                            </button>

                            {menuOpen && (
                              <div className="msg-menu" role="menu">
                                <button
                                  type="button"
                                  className="msg-menu-item"
                                  role="menuitem"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    beginReply(m);
                                  }}
                                >
                                  <FiCornerUpLeft /> Reply
                                </button>

                                {mine ? (
                                  <button
                                    type="button"
                                    className="msg-menu-item"
                                    role="menuitem"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      beginEdit(m);
                                    }}
                                  >
                                    <FiEdit2 /> Edit
                                  </button>
                                ) : null}

                                {mine ? (
                                  <button
                                    type="button"
                                    className="msg-menu-item msg-menu-danger"
                                    role="menuitem"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteMessage(m.id);
                                    }}
                                    disabled={deletingMsgId === m.id}
                                  >
                                    <FiTrash2 /> {deletingMsgId === m.id ? "Deleting…" : "Delete"}
                                  </button>
                                ) : null}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="msg-bubble">
                          {isEditing ? (
                            <div className="msg-edit">
                              <textarea
                                ref={editInputRef}
                                className="msg-edit-input"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                rows={2}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    cancelEdit();
                                  }
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    saveEdit(m.id);
                                  }
                                }}
                                disabled={isSaving}
                              />

                              <div className="msg-edit-actions">
                                <button
                                  type="button"
                                  className="msg-edit-btn msg-edit-cancel"
                                  onClick={cancelEdit}
                                  disabled={isSaving}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="msg-edit-btn msg-edit-save"
                                  onClick={() => saveEdit(m.id)}
                                  disabled={isSaving || !editValue.trim()}
                                >
                                  {isSaving ? "Saving…" : "Save"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* ✅ reply block */}
                              {reply ? (
                                <div className="msg-reply">
                                  <div className="msg-reply-bar" />
                                  <div className="msg-reply-content">
                                    <div className="msg-reply-title">
                                      {getReplyAuthorLabel(reply.senderId)}
                                    </div>
                                    <div className="msg-reply-text">{clip(reply.text, 140)}</div>
                                  </div>
                                </div>
                              ) : null}

                              {/* ✅ media (universal) */}
                              {media.url && media.type === "image" ? (
                                <a className="msg-media" href={media.url} target="_blank" rel="noreferrer">
                                  <img className="msg-media-img" src={media.url} alt="image" />
                                </a>
                              ) : null}

                              {media.url && media.type === "video" ? (
                                <div className="msg-media">
                                  <video className="msg-media-video" src={media.url} controls />
                                </div>
                              ) : null}

                              <div className="msg-text">{m.text}</div>
                              <div className="msg-time">
                                {formatTime(m.createdAt)}
                                {(m as any).editedAt ? <span className="msg-edited"> • edited</span> : null}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}

                <div ref={bottomRef} />
              </div>

              {/* composer */}
              <div className="chats-compose">
                {/* ✅ Reply bar (Telegram-style) */}
                {replyTo ? (
                  <div className="chats-replybar">
                    <div className="chats-replybar-left">
                      <div className="chats-replybar-title">
                        Reply to{" "}
                        {replyTo.senderId === me?.id
                          ? "yourself"
                          : activePeer?.displayName || activePeer?.username || "user"}
                      </div>
                      <div className="chats-replybar-text">{clip(replyTo.text, 220)}</div>
                    </div>

                    <button
                      type="button"
                      className="chats-replybar-close"
                      onClick={cancelReply}
                      aria-label="Cancel reply"
                    >
                      <FiX />
                    </button>
                  </div>
                ) : null}

                {/* ✅ input + send in one row */}
                <div className="chats-compose-row">
                  {/* ✅ attach */}
                  <button
                    type="button"
                    className="chats-attach"
                    onClick={pickMedia}
                    disabled={!activeConvId || sending || uploading}
                    title="Attach photo or video"
                    aria-label="Attach"
                  >
                    <FiPaperclip />
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="chats-file"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.currentTarget.value = "";
                      if (f) handlePickFile(f);
                    }}
                  />

                  <input
                    className="chats-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={uploading ? "Uploading…" : "Message…"}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    disabled={sending || uploading}
                  />

                  <button
                    type="button"
                    className="chats-send"
                    onClick={handleSend}
                    disabled={sending || uploading || !text.trim()}
                    title="Send"
                    aria-label="Send"
                  >
                    <FiSend />
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
