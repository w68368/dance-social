// apps/web/src/components/Header.tsx
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState, useRef, type ReactNode } from "react";
import Logo from "./Logo";
import "../styles/components/header.css";

import { api } from "../api";
import { clearAccessToken } from "../lib/accessToken";
import { getUser, clearAuth, onAuthChange } from "../lib/auth";

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

                  {/* ✅ NEW: Settings */}
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
          )}
        </div>

        {/* burger button */}
        <button
          className={"su-mobile-toggle" + (open ? " is-open" : "")}
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="su-mobile-panel"
          onClick={() => setOpen((v) => !v)}
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

              {/* ✅ NEW: Settings in mobile menu (shown always; route is protected anyway) */}
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

                  {/* ✅ Optional: quick Settings button for logged-in user */}
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
