// apps/web/src/pages/Dashboard.tsx
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import "../styles/pages/dashboard.css";

import {
  FiCalendar,
  FiRepeat,
  FiAward,
  FiHome,
  FiChevronRight,
} from "react-icons/fi";

type CardItem = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string; // date/time, location, status
  href?: string;
};

type Section = {
  key: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  items: CardItem[];
  emptyText: string;
  emptyHint?: string;
  cta?: { label: string; href: string };
};

export default function Dashboard() {
  // ✅ Later you will replace these with real API data
  const sections: Section[] = useMemo(
    () => [
      {
        key: "classes",
        title: "Classes",
        subtitle: "Your recurring weekly schedule",
        icon: <FiRepeat />,
        items: [],
        emptyText: "No classes yet",
        emptyHint: "Join weekly classes and they will appear here.",
        cta: { label: "Explore classes", href: "/recommendations" },
      },
      {
        key: "events",
        title: "Events",
        subtitle: "Workshops & camps you joined",
        icon: <FiCalendar />,
        items: [],
        emptyText: "No events yet",
        emptyHint: "Workshops and camps you join will appear here.",
        cta: { label: "Explore events", href: "/recommendations" },
      },
      {
        key: "challenges",
        title: "Challenges",
        subtitle: "Accepted, in progress, or completed",
        icon: <FiAward />,
        items: [],
        emptyText: "No challenges yet",
        emptyHint: "Accept a challenge to start tracking it here.",
        cta: { label: "Browse challenges", href: "/challenges" },
      },
      {
        key: "studio",
        title: "Studio Rental",
        subtitle: "Your current booking status",
        icon: <FiHome />,
        items: [],
        emptyText: "No active rental",
        emptyHint: "Book a studio and it will show up here.",
        // cta can be added later when you have a studio page
      },
    ],
    []
  );

  return (
    <div className="su-dash">
      <div className="su-dash__top">
        <div className="su-dash__titleWrap">
          <h1 className="su-dash__title">Dashboard</h1>
          <p className="su-dash__subtitle">
            A quick overview of your dance activities.
          </p>
        </div>
      </div>

      <div className="su-dash__grid">
        {sections.map((s) => (
          <section key={s.key} className="su-dashCard">
            <div className="su-dashCard__head">
              <div className="su-dashCard__icon" aria-hidden="true">
                {s.icon}
              </div>

              <div className="su-dashCard__meta">
                <div className="su-dashCard__titleRow">
                  <div className="su-dashCard__title">{s.title}</div>

                  {s.cta && (
                    <Link className="su-dashCard__cta" to={s.cta.href}>
                      {s.cta.label} <FiChevronRight />
                    </Link>
                  )}
                </div>

                <div className="su-dashCard__sub">{s.subtitle}</div>
              </div>
            </div>

            <div className="su-dashCard__body">
              {s.items.length === 0 ? (
                <div className="su-dashEmpty">
                  <div className="su-dashEmpty__title">{s.emptyText}</div>
                  {s.emptyHint && (
                    <div className="su-dashEmpty__hint">{s.emptyHint}</div>
                  )}
                </div>
              ) : (
                <div className="su-dashList">
                  {s.items.map((it) => (
                    <div key={it.id} className="su-dashItem">
                      <div className="su-dashItem__left">
                        <div className="su-dashItem__title">{it.title}</div>
                        {it.subtitle && (
                          <div className="su-dashItem__sub">{it.subtitle}</div>
                        )}
                        {it.meta && (
                          <div className="su-dashItem__meta">{it.meta}</div>
                        )}
                      </div>

                      <div className="su-dashItem__right">
                        {it.href ? (
                          <Link className="su-dashItem__link" to={it.href}>
                            View <FiChevronRight />
                          </Link>
                        ) : (
                          <span className="su-dashItem__muted">—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="su-dash__note">
        <div className="su-dash__noteTitle">Coming next</div>
        <div className="su-dash__noteText">
          When we connect backend data, these cards will fill automatically and
          empty states will disappear.
        </div>
      </div>
    </div>
  );
}
