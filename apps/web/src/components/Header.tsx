import { Link, NavLink } from "react-router-dom";
import { useState } from "react";
import Logo from "./Logo";
import "../styles/header.css";

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
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
  const [open, setOpen] = useState(false);

  return (
    <header className="su-header">
      <div className="su-header__inner">
        {/* Лого (слева) */}
        <div className="su-left">
          <Logo />
        </div>

        {/* Навигация (центр) — только десктоп */}
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
                Add video
              </Link>
            </li>
          </ul>
        </nav>

        {/* Право — auth (десктоп) */}
        <div className="su-right">
          <Link className="auth-link" to="/login">
            Sign in
          </Link>
          <Link className="auth-link su-pill" to="/register">
            Sign up
          </Link>
        </div>

        {/* Бургер (мобайл) */}
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

      {/* Мобильная панель */}
      <div
        id="su-mobile-panel"
        className={"su-mobile-panel" + (open ? " open" : "")}
        onClick={() => setOpen(false)}
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

          <Link className="mobile-btn" to="/add-video">
            Add video
          </Link>

          <div className="mobile-divider" />
          <Link className="mobile-auth" to="/login">
            Sign in
          </Link>
          <Link className="mobile-auth" to="/register">
            Sign up
          </Link>
        </nav>
      </div>
    </header>
  );
}
