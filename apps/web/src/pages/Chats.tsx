// apps/web/src/pages/Chats.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchConversations,
  fetchConversationMessages,
  openDm,
  sendConversationMessage,
  deleteChatMessage,
  editConversationMessage,
  type ChatConversationListItem,
  type ChatMessage,
  type ChatPeer,
} from "../api";
import { getUser } from "../lib/auth";
import "../styles/pages/chats.css";

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function clip(s: string, n = 80) {
  const t = (s || "").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + "…";
}

export default function Chats() {
  const me = getUser();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();

  const [conversations, setConversations] = useState<ChatConversationListItem[]>(
    []
  );
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activePeer, setActivePeer] = useState<ChatPeer | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // --- message menu (⋯)
  const [openMsgMenuId, setOpenMsgMenuId] = useState<string | null>(null);
  const msgMenuRef = useRef<HTMLDivElement | null>(null);
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null);

  // --- edit state
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);

  // ✅ reply state
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);

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
      if (
        openMsgMenuId &&
        msgMenuRef.current &&
        !msgMenuRef.current.contains(t)
      ) {
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
        setMessages(messages);

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

  const handleSend = async () => {
    if (!activeConvId) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setSending(true);
    setChatError(null);

    const optimistic: ChatMessage = {
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
      const real = await sendConversationMessage(
        activeConvId,
        trimmed,
        optimistic.replyToId ?? null
      );

      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? real : m))
      );

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
                  editedAt: real.editedAt ?? null,
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

  const beginEdit = (m: ChatMessage) => {
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
      cur.map((m) =>
        m.id === messageId ? { ...m, text: newText, editedAt: nowIso } : m
      )
    );

    try {
      const updated = await editConversationMessage(messageId, newText);

      setMessages((cur) =>
        cur.map((m) => (m.id === messageId ? updated : m))
      );

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
                editedAt: updated.editedAt ?? null,
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

  // ✅ Reply start (for any message)
  const beginReply = (m: ChatMessage) => {
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

  return (
    <main className="su-main">
      <div className="container chats-wrap">
        {/* Left: conversations */}
        <aside className="chats-sidebar">
          <div className="chats-sidebar-header">
            <div className="chats-title">Chats</div>
            <button
              className="chats-refresh"
              type="button"
              onClick={loadList}
              title="Refresh"
            >
              ↻
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
                      <div className="chats-time">
                        {formatTime(c.updatedAt)}
                      </div>
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
                      {activePeer?.displayName ||
                        activePeer?.username ||
                        "Chat"}
                    </div>
                    {activePeer?.username && (
                      <div className="chats-chat-peer-handle">
                        @{activePeer.username}
                      </div>
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
                {loadingChat && (
                  <div className="chats-muted">Loading messages…</div>
                )}
                {chatError && <div className="chats-error">{chatError}</div>}

                {!loadingChat &&
                  !chatError &&
                  messages.map((m) => {
                    const mine = !!me && m.senderId === me.id;
                    const menuOpen = openMsgMenuId === m.id;
                    const canMenu = !m.id.startsWith("tmp_");
                    const isEditing = editingMsgId === m.id;
                    const isSaving = savingEditId === m.id;

                    // for display reply data
                    const reply = m.replyTo ?? null;

                    return (
                      <div
                        key={m.id}
                        className={`msg ${mine ? "msg--mine" : "msg--theirs"}`}
                      >
                        {/* ✅ MENU рядом с bubble (НЕ внутри) */}
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
                                setOpenMsgMenuId((cur) =>
                                  cur === m.id ? null : m.id
                                );
                              }}
                            >
                              ⋯
                            </button>

                            {menuOpen && (
                              <div className="msg-menu" role="menu">
                                {/* ✅ Reply always */}
                                <button
                                  type="button"
                                  className="msg-menu-item"
                                  role="menuitem"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    beginReply(m);
                                  }}
                                >
                                  Reply
                                </button>

                                {/* ✅ Edit only mine */}
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
                                    Edit
                                  </button>
                                ) : null}

                                {/* ✅ Delete only mine */}
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
                                    {deletingMsgId === m.id
                                      ? "Deleting…"
                                      : "Delete message"}
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
                                    {/* NOTE: clip only for UI, full fix in CSS (2 lines) */}
                                    <div className="msg-reply-text">
                                      {clip(reply.text, 140)}
                                    </div>
                                  </div>
                                </div>
                              ) : null}

                              <div className="msg-text">{m.text}</div>
                              <div className="msg-time">
                                {formatTime(m.createdAt)}
                                {m.editedAt ? (
                                  <span className="msg-edited"> • edited</span>
                                ) : null}
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
                          : activePeer?.displayName ||
                            activePeer?.username ||
                            "user"}
                      </div>
                      <div className="chats-replybar-text">
                        {clip(replyTo.text, 220)}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="chats-replybar-close"
                      onClick={cancelReply}
                      aria-label="Cancel reply"
                    >
                      ✕
                    </button>
                  </div>
                ) : null}

                {/* ✅ input + send in one row */}
                <div className="chats-compose-row">
                  <input
                    className="chats-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Message…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    disabled={sending}
                  />

                  <button
                    type="button"
                    className="chats-send"
                    onClick={handleSend}
                    disabled={sending || !text.trim()}
                  >
                    {sending ? "…" : "Send"}
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
