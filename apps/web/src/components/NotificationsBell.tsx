import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiBell, FiCheck } from "react-icons/fi";
import {
  fetchNotifications,
  fetchUnreadNotificationsCount,
  markAllNotificationsRead,
  markNotificationsRead,
  type NotificationItem,
} from "../api";

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const days = Math.floor(h / 24);
  return `${days} дн назад`;
}

export default function NotificationsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  async function refreshCount() {
    try {
      const r = await fetchUnreadNotificationsCount();
      setCount(r.count);
    } catch {}
  }

  async function loadList() {
    setLoading(true);
    try {
      const r = await fetchNotifications({ unreadOnly: false, take: 20 });
      setItems(r.items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshCount();
    const t = window.setInterval(refreshCount, 12000); // polling count
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (open) loadList();
  }, [open]);

  async function onOpen() {
    setOpen((v) => !v);
  }

  async function onClickItem(n: NotificationItem) {
    // mark read then navigate
    if (!n.isRead) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setCount((c) => Math.max(0, c - 1));
      markNotificationsRead([n.id]).catch(() => {});
    }
    if (n.url) navigate(n.url);
    setOpen(false);
  }

  async function onMarkAll() {
    await markAllNotificationsRead();
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
    setCount(0);
  }

  return (
    <div className="notifWrap" ref={wrapRef}>
      <button className="notifBtn" onClick={onOpen} aria-label="Уведомления">
        <FiBell />
        {count > 0 && <span className="notifBadge">{count > 99 ? "99+" : count}</span>}
      </button>

      {open && (
        <div className="notifDropdown">
          <div className="notifTop">
            <div className="notifTitle">Уведомления</div>
            <button className="notifMarkAll" onClick={onMarkAll} title="Отметить все прочитанным">
              <FiCheck />
              <span>Прочитано</span>
            </button>
          </div>

          {loading ? (
            <div className="notifEmpty">Загрузка…</div>
          ) : items.length === 0 ? (
            <div className="notifEmpty">Пока нет уведомлений</div>
          ) : (
            <div className="notifList">
              {items.map((n) => (
                <button
                  key={n.id}
                  className={"notifItem " + (n.isRead ? "read" : "unread")}
                  onClick={() => onClickItem(n)}
                >
                  <div className="notifRow">
                    <div className="notifItemTitle">{n.title}</div>
                    <div className="notifTime">{timeAgo(n.createdAt)}</div>
                  </div>
                  {n.body && <div className="notifBody">{n.body}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
