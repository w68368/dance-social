import { NavLink, Link } from "react-router-dom";
import { getUser } from "../lib/auth";
import { api } from "../api";

type Props = {
  onClose: () => void;
};

export default function MobileMenu({ onClose }: Props) {
  const user = getUser();

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      // ignore
    }

    try {
      localStorage.removeItem("su_user");
    } catch {}

    window.location.href = "/login";
  };

  return (
    <>
      <div className="su-mobile-nav__backdrop" onClick={onClose} />

      <div className="su-mobile-nav">
        <div className="su-mobile-nav__header">
          <span className="su-logo">Step Unity</span>
          <button className="su-mobile-nav__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <nav className="su-mobile-nav__links">
          <NavLink to="/" className="su-mobile-nav__link">
            Feed
          </NavLink>
          <NavLink to="/ranking" className="su-mobile-nav__link">
            Ranking
          </NavLink>
          <NavLink to="/challenges" className="su-mobile-nav__link">
            Challenges
          </NavLink>
          <NavLink to="/recommendations" className="su-mobile-nav__link">
            Recommendations
          </NavLink>
          <NavLink to="/add-video" className="su-mobile-nav__link">
            Add video
          </NavLink>
        </nav>

        <div className="su-mobile-nav__auth">
          {user ? (
            <>
              <Link to="/profile" className="su-mobile-nav__link">
                Profile
              </Link>
              <button
                className="su-btn su-btn-primary su-mobile-nav__btn"
                onClick={logout}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="su-btn su-btn-primary su-mobile-nav__btn"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="su-btn su-btn-outline su-mobile-nav__btn"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
