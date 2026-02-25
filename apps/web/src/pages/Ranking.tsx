// apps/web/src/pages/Ranking.tsx
import { useEffect, useMemo, useState } from "react";
import { fetchRanking, type RankingUser } from "../api";
import "../styles/pages/ranking.css";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

function displayName(u: RankingUser) {
  return u.displayName || u.username;
}

function Avatar({ u, size = 44 }: { u: RankingUser; size?: number }) {
  const style = { width: size, height: size } as const;
  if (u.avatarUrl) {
    return <img className="rk-avatar" style={style} src={u.avatarUrl} alt="" />;
  }
  return (
    <div className="rk-avatar rk-avatar--fallback" style={style}>
      {initials(displayName(u))}
    </div>
  );
}

function MedalIcon({ place }: { place: 1 | 2 | 3 }) {
  const title = place === 1 ? "Gold" : place === 2 ? "Silver" : "Bronze";
  return (
    <span
      className={`rk-topCard__medal rk-topCard__medal--${place}`}
      title={title}
      aria-label={title}
    >
      ★
    </span>
  );
}

export default function Ranking() {
  const [items, setItems] = useState<RankingUser[]>([]);
  const [take, setTake] = useState(50);

  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const load = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;

    if (items.length === 0) setInitialLoading(true);
    else setRefreshing(true);

    if (!silent) setErr(null);

    try {
      const list = await fetchRanking(take);
      setItems(list);
      setLastUpdatedAt(Date.now());
    } catch (e: any) {
      const msg =
        e?.response?.data?.message || e?.message || "Failed to load ranking";
      setErr(msg);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load({ silent: true });

    const t = setInterval(() => load({ silent: true }), 15000);

    const handler = () => load({ silent: true });
    window.addEventListener("ranking:update", handler);

    return () => {
      clearInterval(t);
      window.removeEventListener("ranking:update", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [take]);

  const podium = useMemo(() => {
    const top = items.slice(0, 3);
    return {
      first: top[0] || null,
      second: top[1] || null,
      third: top[2] || null,
    };
  }, [items]);

  const rest = useMemo(() => items.slice(3), [items]);

  const updatedText = useMemo(() => {
    if (!lastUpdatedAt) return "—";
    const d = new Date(lastUpdatedAt);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [lastUpdatedAt]);

  const topPoints = items[0]?.points ?? 0;

  const TopCard = ({
    user,
    place,
  }: {
    user: RankingUser | null;
    place: 1 | 2 | 3;
  }) => {
    if (!user) {
      return (
        <div className={`rk-topCard rk-topCard--${place} rk-topCard--empty`}>
          <div className="rk-topCard__place">#{place}</div>
          <MedalIcon place={place} />
          <div className="rk-topCard__emptyText">No data</div>
        </div>
      );
    }

    return (
      <div className={`rk-topCard rk-topCard--${place}`}>
        <div className="rk-topCard__place">#{place}</div>
        <MedalIcon place={place} />

        <div className="rk-topCard__avatar">
          <Avatar u={user} size={place === 1 ? 64 : 56} />
        </div>

        <div className="rk-topCard__name">{displayName(user)}</div>
        <div className="rk-topCard__user">@{user.username}</div>

        <div className="rk-topCard__points">
          <span className="rk-topCard__pointsValue">{user.points}</span>
          <span className="rk-topCard__pointsLabel">pts</span>
        </div>
      </div>
    );
  };

  return (
    <div className="rk">
      <div className="rk__topbar">
        <div className="rk__title">
          <h1>Ranking</h1>
          <div className="rk__hint">
            Top active dancers based on platform points
          </div>
        </div>

        <div className="rk__controls">
          <div className="rk-select">
            <span className="rk-select__label">Show</span>
            <select
              value={take}
              onChange={(e) => setTake(Number(e.target.value))}
            >
              <option value={10}>Top 10</option>
              <option value={25}>Top 25</option>
              <option value={50}>Top 50</option>
              <option value={100}>Top 100</option>
            </select>
          </div>

          <button
            className="rk-btn"
            onClick={() => load()}
            disabled={refreshing && items.length > 0}
          >
            {refreshing && items.length > 0 ? (
              <>
                <span className="rk-spinner" /> Updating
              </>
            ) : (
              "Refresh"
            )}
          </button>
        </div>
      </div>

      <div className="rk__status">
        <div className="rk__status-left">
          <span className={`rk-pill ${refreshing ? "rk-pill--live" : ""}`}>
            {refreshing ? "Live update" : "Stable"}
          </span>
          <span className="rk__updated">Last update: {updatedText}</span>
        </div>

        {err && <div className="rk__error">⚠ {err}</div>}
      </div>

      {initialLoading && items.length === 0 ? (
        <div className="rk-card">
          <div className="rk-skel">
            <div className="rk-skel__bar" />
            <div className="rk-skel__row" />
            <div className="rk-skel__row" />
            <div className="rk-skel__row" />
          </div>
        </div>
      ) : (
        <>
          <div className="rk-top3">
            <TopCard user={podium.second} place={2} />
            <TopCard user={podium.first} place={1} />
            <TopCard user={podium.third} place={3} />
          </div>

          <div className="rk-card rk-card--table">
            <div className="rk-table2">
              <div className="rk-table2__head">
                <div className="h-rank">Rank</div>
                <div className="h-user">User</div>
                <div className="h-points">Points</div>
              </div>

              {rest.map((u, idx) => {
                const rank = idx + 4;
                const pct =
                  topPoints > 0
                    ? Math.max(0, Math.min(100, (u.points / topPoints) * 100))
                    : 0;

                return (
                  <div className="rk-rowCard" key={u.id}>
                    <div className="rk-rankChip">
                      <span className="rk-rankChip__hash">#</span>
                      <span className="rk-rankChip__num">{rank}</span>
                    </div>

                    <div className="rk-userCard">
                      <Avatar u={u} />
                      <div className="rk-userCard__meta">
                        <div className="rk-userCard__name">{displayName(u)}</div>
                        <div className="rk-userCard__user">@{u.username}</div>
                        <div className="rk-userCard__bar" aria-hidden>
                          <div
                            className="rk-userCard__barFill"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rk-pointsBlock">
                      <div className="rk-pointsBlock__value">{u.points}</div>
                      <div className="rk-pointsBlock__label">points</div>
                    </div>
                  </div>
                );
              })}

              {items.length > 0 && rest.length === 0 && (
                <div className="rk-empty">Only top 3 users so far</div>
              )}
              {items.length === 0 && <div className="rk-empty">No users yet</div>}
            </div>

            <div className={`rk-progress ${refreshing ? "rk-progress--on" : ""}`} />
          </div>
        </>
      )}
    </div>
  );
}