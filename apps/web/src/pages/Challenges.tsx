// apps/web/src/pages/Challenges.tsx
import { useEffect, useMemo, useState } from "react";
import {
  acceptChallenge,
  createChallenge,
  fetchMyAcceptedChallenges,
  fetchMyCreatedChallenges,
  fetchNewChallenges,
  fetchTrendingChallenges,
  type ChallengeItem,
  type ChallengeLevel,
} from "../api";
import { getUser } from "../lib/auth";
import "../styles/pages/challenges.css";

import {
  FiPlus,
  FiClock,
  FiTrendingUp,
  FiStar,
  FiCheckCircle,
} from "react-icons/fi";

type CreateForm = {
  title: string;
  description: string;
  style: string;
  level: ChallengeLevel;
  durationDays: number;
  exampleFile: File | null;
};

const POPULAR_STYLES = [
  "Hip-Hop",
  "High Heels",
  "Contemporary",
  "K-Pop",
  "Jazz Funk",
  "House",
  "Popping",
  "Locking",
  "Breaking",
  "Vogue",
  "Waacking",
  "Dancehall",
  "Afro",
] as const;

function daysLeft(endsAt: string) {
  const end = new Date(endsAt).getTime();
  const now = Date.now();
  const diff = end - now;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function levelLabel(level: ChallengeLevel) {
  switch (level) {
    case "BEGINNER":
      return "Beginner";
    case "INTERMEDIATE":
      return "Intermediate";
    case "ADVANCED":
      return "Advanced";
    case "PRO":
      return "Pro";
  }
}

export default function Challenges() {
  const me = getUser();

  const [trending, setTrending] = useState<ChallengeItem[]>([]);
  const [latest, setLatest] = useState<ChallengeItem[]>([]);
  const [mineAccepted, setMineAccepted] = useState<ChallengeItem[]>([]);
  const [mineCreated, setMineCreated] = useState<ChallengeItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [form, setForm] = useState<CreateForm>({
    title: "",
    description: "",
    style: "",
    level: "BEGINNER",
    durationDays: 7,
    exampleFile: null,
  });

  const canCreate = useMemo(() => {
    return (
      form.title.trim().length >= 3 &&
      form.description.trim().length >= 10 &&
      form.style.trim().length >= 2 &&
      Number.isFinite(form.durationDays) &&
      form.durationDays >= 1 &&
      form.durationDays <= 365
    );
  }, [form]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [t, n, a, c] = await Promise.all([
        fetchTrendingChallenges(12),
        fetchNewChallenges(12),
        me ? fetchMyAcceptedChallenges(24) : Promise.resolve({ items: [] }),
        me ? fetchMyCreatedChallenges(24) : Promise.resolve({ items: [] }),
      ]);

      setTrending(t.items);
      setLatest(n.items);
      setMineAccepted(a.items);
      setMineCreated(c.items);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Failed to load challenges.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onAccept(id: string) {
    if (!me) return;
    try {
      await acceptChallenge(id);
      const a = await fetchMyAcceptedChallenges(24);
      setMineAccepted(a.items);
    } catch (e: any) {
      alert(e?.response?.data?.error ?? "Failed to accept challenge.");
    }
  }

  async function onCreate() {
    if (!canCreate) return;
    setCreateBusy(true);
    setCreateError(null);

    try {
      const res = await createChallenge({
        title: form.title.trim(),
        description: form.description.trim(),
        style: form.style.trim(),
        level: form.level,
        durationDays: form.durationDays,
        exampleFile: form.exampleFile ?? undefined,
      });

      setMineCreated((prev) => [res.challenge, ...prev]);
      setLatest((prev) => [res.challenge, ...prev]);

      setIsCreateOpen(false);
      setForm({
        title: "",
        description: "",
        style: "",
        level: "BEGINNER",
        durationDays: 7,
        exampleFile: null,
      });
    } catch (e: any) {
      setCreateError(e?.response?.data?.error ?? "Failed to create challenge.");
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div className="chPage">
      <div className="chTop">
        <div className="chTitle">
          <h1>Challenges</h1>
          <p>
            Pick a challenge, practice, upload your video, and grow with the
            community.
          </p>
        </div>

        <button className="chCreateBtn" onClick={() => setIsCreateOpen(true)}>
          <FiPlus /> Create Challenge
        </button>
      </div>

      {loading && <div className="chEmpty">Loading...</div>}
      {!loading && error && <div className="chError">{error}</div>}

      {!loading && !error && (
        <>
          <Section
            icon={<FiTrendingUp />}
            title="Trending Now"
            subtitle="Most accepted challenges right now"
            items={trending}
            me={!!me}
            onAccept={onAccept}
          />

          <Section
            icon={<FiStar />}
            title="New Challenges"
            subtitle="Fresh challenges created recently"
            items={latest}
            me={!!me}
            onAccept={onAccept}
          />

          <div className="chSplit">
            <Section
              icon={<FiCheckCircle />}
              title="My Accepted"
              subtitle={
                me
                  ? "Challenges you joined"
                  : "Sign in to see your accepted challenges"
              }
              items={mineAccepted}
              me={!!me}
              onAccept={onAccept}
              compact
            />

            <Section
              icon={<FiPlus />}
              title="My Created"
              subtitle={
                me
                  ? "Challenges you created"
                  : "Sign in to create and manage your challenges"
              }
              items={mineCreated}
              me={!!me}
              onAccept={onAccept}
              compact
            />
          </div>
        </>
      )}

      {isCreateOpen && (
        <div
          className="chModalOverlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsCreateOpen(false);
          }}
        >
          <div className="chModal">
            <div className="chModalHead">
              <div>
                <h2>Create Challenge</h2>
                <p>Fill in the details and publish your challenge.</p>
              </div>
              <button
                className="chModalClose"
                onClick={() => setIsCreateOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="chForm">
              <label>
                <span>Challenge Title</span>
                <input
                  value={form.title}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, title: e.target.value }))
                  }
                  placeholder="e.g. 7-Day High Heels Combo"
                  maxLength={80}
                />
              </label>

              <label>
                <span>Description</span>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Explain what dancers should do, key rules, and tips."
                  maxLength={1500}
                  rows={5}
                />
              </label>

              <div className="chRow">
                <label>
                  <span>Dancer Level</span>
                  <select
                    value={form.level}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        level: e.target.value as ChallengeLevel,
                      }))
                    }
                  >
                    <option value="BEGINNER">Beginner</option>
                    <option value="INTERMEDIATE">Intermediate</option>
                    <option value="ADVANCED">Advanced</option>
                    <option value="PRO">Pro</option>
                  </select>
                </label>

                <label>
                  <span>Dance Style</span>
                  <select
                    value={form.style}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, style: e.target.value }))
                    }
                  >
                    <option value="" disabled>
                      Select a style
                    </option>
                    {POPULAR_STYLES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                <span>Active Duration (days)</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={form.durationDays}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      durationDays: Number(e.target.value),
                    }))
                  }
                />
              </label>

              <label>
                <span>Example Video (optional)</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      exampleFile: e.target.files?.[0] ?? null,
                    }))
                  }
                />
                <small>
                  Upload a short video showing how the challenge should look.
                </small>
              </label>

              {createError && <div className="chError">{createError}</div>}

              <div className="chActions">
                <button
                  className="chBtnGhost"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={createBusy}
                >
                  Cancel
                </button>
                <button
                  className="chBtnPrimary"
                  onClick={onCreate}
                  disabled={!canCreate || createBusy || !me}
                >
                  {createBusy ? "Creating..." : "Create Challenge"}
                </button>
              </div>

              {!me && (
                <div className="chHint">Please sign in to create a challenge.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section(props: {
  icon: any;
  title: string;
  subtitle: string;
  items: ChallengeItem[];
  me: boolean;
  onAccept: (id: string) => void;
  compact?: boolean;
}) {
  const { icon, title, subtitle, items, me, onAccept, compact } = props;

  return (
    <section className="chSection">
      <div className="chSectionHead">
        <div className="chSectionTitle">
          <span className="chIcon">{icon}</span>
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="chEmpty">No challenges yet.</div>
      ) : (
        <div className={compact ? "chGrid chGridCompact" : "chGrid"}>
          {items.map((c) => (
            <div className="chCard" key={c.id}>
              <div className="chCardTop">
                <div className="chCardTitle">{c.title}</div>
                <div className="chBadge">
                  {levelLabel(c.level)} • {c.style}
                </div>
              </div>

              <div className="chDesc">{c.description}</div>

              <div className="chMeta">
                <div className="chMetaItem">
                  <FiClock />
                  <span>{Math.max(0, daysLeft(c.endsAt))} days left</span>
                </div>
                <div className="chMetaItem">
                  <span>{c._count.participants} accepted</span>
                  <span>•</span>
                  <span>{c._count.submissions} videos</span>
                </div>
              </div>

              <div className="chCardActions">
                {c.exampleVideoUrl ? (
                  <a
                    className="chBtnGhost"
                    href={c.exampleVideoUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Watch Example
                  </a>
                ) : (
                  <button
                    className="chBtnGhost"
                    disabled
                    title="No example video provided"
                  >
                    Watch Example
                  </button>
                )}

                <button
                  className="chBtnPrimary"
                  disabled={!me}
                  onClick={() => onAccept(c.id)}
                >
                  Accept
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
