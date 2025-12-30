import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState, useRef, type ReactNode } from "react";
import Logo from "./Logo";
import "../styles/components/header.css";

import { api } from "../api";
import {
  fetchNotifications,
  fetchUnreadNotificationsCount,
  markAllNotificationsRead,
  markNotificationsRead,
  deleteNotification,
  deleteReadNotifications,
  deleteAllNotifications,
  type NotificationItem,
} from "../api";

import { clearAccessToken } from "../lib/accessToken";
import { getUser, clearAuth, onAuthChange } from "../lib/auth";

import { FiBell, FiCheck, FiX, FiTrash2 } from "react-icons/fi";

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        "nav-link" + (isActive ? " nav-link--active" : "")
      }
    >
      {children}
      <span className="nav-underline" />
    </NavLink>
  );
}

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

/**
 * Notifications bell (header widget)
 * - visible only when logged in (render controlled by parent)
 * - polling unread count every 12s
 * - dropdown list on open
 */
function NotificationsBell() {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function refreshCount() {
    try {
      const r = await fetchUnreadNotificationsCount();
      setCount(r.count ?? 0);
    } catch {}
  }

  async function loadList() {
    setLoading(true);
    try {
      const r = await fetchNotifications({ unreadOnly: false, take: 20 });
      setItems(r.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshCount();
    const t = window.setInterval(refreshCount, 12000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (open) loadList();
  }, [open]);

  async function onClickItem(n: NotificationItem) {
    if (!n.isRead) {
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x))
      );
      setCount((c) => Math.max(0, c - 1));
      markNotificationsRead([n.id]).catch(() => {});
    }

    if (n.url) navigate(n.url);
    setOpen(false);
    setMenuOpen(false);
  }

  async function onMarkAllRead() {
    await markAllNotificationsRead();
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
    setCount(0);
    setMenuOpen(false);
  }

  async function onClearRead() {
    await deleteReadNotifications();
    setItems((prev) => prev.filter((x) => !x.isRead));
    setMenuOpen(false);
  }

  async function onClearAll() {
    await deleteAllNotifications();
    setItems([]);
    setCount(0);
    setMenuOpen(false);
  }

  function onDeleteOne(e: React.MouseEvent, n: NotificationItem) {
    e.stopPropagation();
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    if (!n.isRead) setCount((c) => Math.max(0, c - 1));
    deleteNotification(n.id).catch(() => {});
  }

  return (
    <div className="su-notif" ref={wrapRef}>
      <button
        className={"su-notif__btn" + (open ? " is-open" : "")}
        onClick={() => {
          setOpen((v) => !v);
          setMenuOpen(false);
        }}
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        type="button"
      >
        <FiBell />
        {count > 0 && (
          <span className="su-notif__badge">{count > 99 ? "99+" : count}</span>
        )}
      </button>

      {open && (
        <div className="su-notif__dropdown" role="menu">
          <div className="su-notif__top">
            <div className="su-notif__title">
              Notifications {count > 0 ? <span className="su-notif__mini">• {count}</span> : null}
            </div>

            <div className="su-notif__actions">
              <button
                className="su-notif__iconBtn"
                type="button"
                title="Actions"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
              >
                {/* simple "..." icon using FiMoreHorizontal */}
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M6 12a1.7 1.7 0 1 1-3.4 0A1.7 1.7 0 0 1 6 12Zm9.7 0A1.7 1.7 0 1 1 12.3 12a1.7 1.7 0 0 1 3.4 0ZM24 12a1.7 1.7 0 1 1-3.4 0A1.7 1.7 0 0 1 24 12Z"
                    fill="currentColor"
                  />
                </svg>
              </button>

              {menuOpen && (
                <div className="su-notif__menu" role="menu">
                  <button className="su-notif__menuItem" onClick={onMarkAllRead} type="button">
                    Mark all as read
                  </button>
                  <button className="su-notif__menuItem" onClick={onClearRead} type="button">
                    Clear read
                  </button>
                  <button className="su-notif__menuItem danger" onClick={onClearAll} type="button">
                    Clear all
                  </button>
                </div>
              )}

              <button
                className="su-notif__iconBtn"
                onClick={() => {
                  setOpen(false);
                  setMenuOpen(false);
                }}
                title="Close"
                type="button"
              >
                <FiX />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="su-notif__empty">Loading…</div>
          ) : items.length === 0 ? (
            <div className="su-notif__empty">No notifications yet</div>
          ) : (
            <div className="su-notif__list">
              {items.map((n) => (
                <button
                  key={n.id}
                  className={"su-notif__item" + (n.isRead ? " is-read" : " is-unread")}
                  onClick={() => onClickItem(n)}
                  type="button"
                >
                  <div className="su-notif__row">
                    <div className="su-notif__itemTitle">{n.title}</div>
                    <div className="su-notif__rowRight">
                      <div className="su-notif__time">{timeAgo(n.createdAt)}</div>
                      <button
                        className="su-notif__del"
                        type="button"
                        title="Delete"
                        onClick={(e) => onDeleteOne(e, n)}
                        aria-label="Delete notification"
                      >
                        <FiX />
                      </button>
                    </div>
                  </div>
                  {n.body && <div className="su-notif__body">{n.body}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [user, setUserState] = useState(getUser());

  // dropdown user-chip
  const [menuOpen, setMenuOpen] = useState(false);
  const chipRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);

  const openNow = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setMenuOpen(true);
  };

  const closeWithDelay = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setMenuOpen(false);
      closeTimer.current = null;
    }, 220);
  };

  useEffect(() => {
    const off = onAuthChange(() => setUserState(getUser()));
    setUserState(getUser());
    return off;
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!chipRef.current) return;
      if (!chipRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore
    } finally {
      clearAccessToken();
      clearAuth();
      navigate("/login");
    }
  };

  const displayName = user?.displayName || user?.username || "User";

  return (
    <header className="su-header">
      <div className="su-header__inner">
        <div className="su-left">
          <Logo />
        </div>

        <nav className="su-center" aria-label="Main">
          <ul className="su-nav">
            <li>
              <NavItem to="/ranking">Ranking</NavItem>
            </li>
            <li>
              <NavItem to="/challenges">Challenges</NavItem>
            </li>
            <li>
              <NavItem to="/recommendations">Recommendations</NavItem>
            </li>
            <li className="divider" />
            <li>
              <Link to="/add-video" className="su-btn su-btn--accent">
                Add post
              </Link>
            </li>
          </ul>
        </nav>

        <div className="su-right">
          {!user ? (
            <>
              <Link className="auth-link" to="/login">
                Sign in
              </Link>
              <Link className="auth-link su-pill" to="/register">
                Sign up
              </Link>
            </>
          ) : (
            <>
              {/* ✅ Notifications bell (only for logged-in users) */}
              <NotificationsBell />

              <div
                ref={chipRef}
                className={"user-chip has-dropdown" + (menuOpen ? " open" : "")}
                onMouseEnter={openNow}
                onMouseLeave={closeWithDelay}
                onClick={() => setMenuOpen((v) => !v)}
                role="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <div className="avatar">
                  <img
                    src={user.avatarUrl || "/uploads/_noavatar.png"}
                    alt={displayName}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        "/uploads/_noavatar.png";
                    }}
                  />
                </div>

                <div className="meta">
                  <span className="name">{displayName}</span>
                  <span className="sub">Profile</span>
                </div>

                <svg
                  className={"chev" + (menuOpen ? " up" : "")}
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                  />
                </svg>

                {/* dropdown */}
                {menuOpen && (
                  <div
                    className="user-dropdown"
                    role="menu"
                    onMouseEnter={openNow}
                    onMouseLeave={closeWithDelay}
                  >
                    <button
                      className="user-dropdown-item"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate("/profile");
                      }}
                    >
                      My profile
                    </button>

                    <button
                      className="user-dropdown-item"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate("/chats");
                      }}
                    >
                      Chats
                    </button>
                    <button
                    className="user-dropdown-item"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/dashboard");
                    }}
                  >
                    Dashboard
                  </button>

                    <button
                      className="user-dropdown-item"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate("/settings");
                      }}
                    >
                      Settings
                    </button>

                    <div className="user-dropdown-divider" />

                    <button className="user-dropdown-item danger" onClick={logout}>
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* burger button */}
        <button
          className={"su-mobile-toggle" + (open ? " is-open" : "")}
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="su-mobile-panel"
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {/* Mobile menu as a modal with a background */}
      {open && (
        <div
          className="su-mobile-overlay"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        >
          <div
            id="su-mobile-panel"
            className="su-mobile-panel open"
            onClick={(e) => e.stopPropagation()}
          >
            <nav aria-label="Mobile">
              <Link className="mobile-link" to="/ranking">
                Ranking
              </Link>
              <Link className="mobile-link" to="/challenges">
                Challenges
              </Link>
              <Link className="mobile-link" to="/recommendations">
                Recommendations
              </Link>
              <Link className="mobile-link" to="/chats">
                Chats
              </Link>
              <Link className="mobile-link" to="/settings">
                Settings
              </Link>
              <Link className="mobile-btn" to="/add-video">
                Add post
              </Link>

              <div className="mobile-divider" />

              {!user ? (
                <>
                  <Link className="mobile-auth" to="/login">
                    Sign in
                  </Link>
                  <Link className="mobile-auth" to="/register">
                    Sign up
                  </Link>
                </>
              ) : (
                <div className="mobile-user">
                  <button
                    className="mobile-user-info"
                    onClick={() => {
                      setOpen(false);
                      navigate("/profile");
                    }}
                    type="button"
                  >
                    <img
                      className="mobile-user-avatar"
                      src={user.avatarUrl || "/uploads/_noavatar.png"}
                      alt={displayName}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "/uploads/_noavatar.png";
                      }}
                    />
                    <span className="mobile-user-name">{displayName}</span>
                  </button>

                  <button
                    className="mobile-auth"
                    onClick={() => {
                      setOpen(false);
                      navigate("/settings");
                    }}
                    type="button"
                  >
                    Settings
                  </button>

                  <button
                    className="mobile-auth logout"
                    onClick={() => {
                      setOpen(false);
                      logout();
                    }}
                    type="button"
                  >
                    Logout
                  </button>
                </div>
              )}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
