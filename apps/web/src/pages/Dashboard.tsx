// apps/web/src/pages/Dashboard.tsx
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import "../styles/pages/dashboard.css";

import {
  FiCalendar,
  FiRepeat,
  FiAward,
  FiHome,
  FiChevronRight,
  FiClock,
} from "react-icons/fi";

import { getUser } from "../lib/auth";
import { fetchMyAcceptedChallenges, type ChallengeItem } from "../api";

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

function daysLeft(endsAt: string) {
  const end = new Date(endsAt).getTime();
  const now = Date.now();
  const diff = end - now;
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

export default function Dashboard() {
  const me = getUser();

  const [acceptedActive, setAcceptedActive] = useState<ChallengeItem[]>([]);
  const [loadingChallenges, setLoadingChallenges] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!me) {
        setAcceptedActive([]);
        return;
      }

      setLoadingChallenges(true);
      try {
        const res = await fetchMyAcceptedChallenges(20);
        const now = Date.now();

        const active = (res.items ?? [])
          .filter((c) => new Date(c.endsAt).getTime() > now)
          .sort(
            (a, b) =>
              new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime()
          )
          .slice(0, 2);

        if (alive) setAcceptedActive(active);
      } catch {
        if (alive) setAcceptedActive([]);
      } finally {
        if (alive) setLoadingChallenges(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [me]);

  const challengeItems: CardItem[] = useMemo(() => {
    return acceptedActive.map((ch) => {
      const left = daysLeft(ch.endsAt);
      const meta = `${left} day${left === 1 ? "" : "s"} left • ${
        ch._count?.participants ?? 0
      } accepted • ${ch._count?.submissions ?? 0} videos`;

      return {
        id: ch.id,
        title: ch.title,
        subtitle: `${ch.level} • ${ch.style}`,
        meta,
        href: "/challenges",
      };
    });
  }, [acceptedActive]);

  // ✅ Keep your existing structure and style
  // ... выше код тот же

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
      items: me ? challengeItems : [],
      // ✅ фиксируем текст — НЕ меняем во время загрузки
      emptyText: me ? "No active challenges" : "Sign in to track challenges",
      emptyHint: me
        ? "Accept a challenge to start tracking it here."
        : "Your accepted challenges will appear here.",
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
    },
  ],
  [challengeItems, me]
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
                          <div className="su-dashItem__meta">
                            {/* nice small icon only for challenges meta */}
                            {s.key === "challenges" && (
                              <span className="su-dashItem__metaIcon" aria-hidden="true">
                                <FiClock />
                              </span>
                            )}
                            <span>{it.meta}</span>
                          </div>
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
    </div>
  );
}
