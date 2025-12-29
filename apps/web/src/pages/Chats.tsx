import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchConversations,
  fetchConversationMessages,
  openDm,
  sendConversationMessage,
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

export default function Chats() {
  const me = getUser();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();

  const [conversations, setConversations] = useState<ChatConversationListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activePeer, setActivePeer] = useState<ChatPeer | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const listLoadedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeConvId) ?? null,
    [conversations, activeConvId]
  );

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
        const dm = await openDm(userId); // {conversationId, peer}
        setActiveConvId(dm.conversationId);
        setActivePeer(dm.peer);

        // if conversation is not in list yet, refresh list
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
        const msgs = await fetchConversationMessages(activeConvId);
        setMessages(msgs);

        // if peer not set (clicked from list), compute from list item
        const fromList = conversations.find((c) => c.id === activeConvId);
        if (fromList?.peer) setActivePeer(fromList.peer);
      } catch (e: any) {
        setChatError(e?.message || "Failed to load messages.");
      } finally {
        setLoadingChat(false);
      }
    })();
  }, [activeConvId, conversations]);

  // --- autoscroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const selectConversation = (c: ChatConversationListItem) => {
    setActiveConvId(c.id);
    setActivePeer(c.peer ?? null);
    setMessages([]);
    setText("");
    // keep URL friendly
    if (c.peer?.id) navigate(`/chats/${c.peer.id}`);
    else navigate(`/chats`);
  };

  const handleSend = async () => {
    if (!activeConvId) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setSending(true);
    setChatError(null);

    // optimistic message
    const optimistic: ChatMessage = {
      id: `tmp_${Date.now()}`,
      text: trimmed,
      createdAt: new Date().toISOString(),
      senderId: me?.id || "me",
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");

    try {
      const real = await sendConversationMessage(activeConvId, trimmed);
      // replace tmp with real
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? real : m)));

      // update list preview (last message + ordering)
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
                  senderId: real.senderId,
                },
              }
            : x
        );
        // move active chat to top
        next.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
        return next;
      });
    } catch (e: any) {
      setChatError(e?.message || "Failed to send message.");
      // rollback optimistic
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setText(trimmed);
    } finally {
      setSending(false);
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
                    const mine = me && m.senderId === me.id;
                    return (
                      <div key={m.id} className={`msg ${mine ? "msg--mine" : "msg--theirs"}`}>
                        <div className="msg-bubble">
                          <div className="msg-text">{m.text}</div>
                          <div className="msg-time">{formatTime(m.createdAt)}</div>
                        </div>
                      </div>
                    );
                  })}

                <div ref={bottomRef} />
              </div>

              {/* composer */}
              <div className="chats-compose">
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
          )}
        </section>
      </div>
    </main>
  );
}
