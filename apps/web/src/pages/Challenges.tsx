// apps/web/src/pages/Challenges.tsx
import { useEffect, useMemo, useState } from "react";
import {
  acceptChallenge,
  leaveChallenge,
  createChallenge,
  deleteChallenge,
  fetchMyAcceptedChallenges,
  fetchMyCreatedChallenges,
  fetchNewChallenges,
  fetchTrendingChallenges,
  submitChallengeVideo,
  fetchChallengeSubmissions,
  setChallengeWinner,
  type ChallengeItem,
  type ChallengeLevel,
  type ChallengeSubmissionItem,
} from "../api";
import { getUser } from "../lib/auth";
import "../styles/pages/challenges.css";

import {
  FiPlus,
  FiClock,
  FiTrendingUp,
  FiStar,
  FiCheckCircle,
  FiMoreHorizontal,
  FiTrash2,
  FiXCircle,
  FiUploadCloud,
  FiPlayCircle,
  FiAward,
  FiCheck,
} from "react-icons/fi";

type CreateForm = {
  title: string;
  description: string;
  style: string;
  level: ChallengeLevel;
  durationDays: number;
  exampleFile: File | null;
};

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

export default function Challenges() {
  const me = getUser();

  const [trending, setTrending] = useState<ChallengeItem[]>([]);
  const [latest, setLatest] = useState<ChallengeItem[]>([]);
  const [mineAccepted, setMineAccepted] = useState<ChallengeItem[]>([]);
  const [mineCreated, setMineCreated] = useState<ChallengeItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // create modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // kebab menu
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // confirm delete modal
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // confirm leave modal
  const [confirmLeave, setConfirmLeave] = useState<{ id: string; title: string } | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  // submit modal (upload my video)
  const [submitFor, setSubmitFor] = useState<{ id: string; title: string } | null>(null);
  const [submitFile, setSubmitFile] = useState<File | null>(null);
  const [submitCaption, setSubmitCaption] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // view submissions modal (with winner info)
  const [viewFor, setViewFor] = useState<{
    id: string;
    title: string;
    winnerUserId?: string | null;
    winnerLabel?: string | null;
  } | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<ChallengeSubmissionItem[]>([]);

  // award winner modal (My Created)
  const [awardFor, setAwardFor] = useState<{
    id: string;
    title: string;
    winnerUserId?: string | null;
    winnerLabel?: string | null;
  } | null>(null);
  const [awardLoading, setAwardLoading] = useState(false);
  const [awardError, setAwardError] = useState<string | null>(null);
  const [awardItems, setAwardItems] = useState<ChallengeSubmissionItem[]>([]);
  const [awardBusy, setAwardBusy] = useState(false);

  const [form, setForm] = useState<CreateForm>({
    title: "",
    description: "",
    style: "",
    level: "BEGINNER",
    durationDays: 7,
    exampleFile: null,
  });

  const acceptedSet = useMemo(() => new Set(mineAccepted.map((c) => c.id)), [mineAccepted]);

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

    const onDocClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement;
      if (!target.closest(".chKebabWrap")) setMenuOpenId(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onAccept(id: string) {
    if (!me) return;
    if (acceptedSet.has(id)) return;

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

  function openDeleteConfirm(ch: ChallengeItem) {
    setMenuOpenId(null);
    setDeleteError(null);
    setConfirmDelete({ id: ch.id, title: ch.title });
  }

  async function confirmDeleteChallenge() {
    if (!confirmDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteChallenge(confirmDelete.id);

      const remove = (arr: ChallengeItem[]) => arr.filter((x) => x.id !== confirmDelete.id);
      setTrending((p) => remove(p));
      setLatest((p) => remove(p));
      setMineAccepted((p) => remove(p));
      setMineCreated((p) => remove(p));

      setConfirmDelete(null);
    } catch (e: any) {
      setDeleteError(e?.response?.data?.error ?? e?.message ?? "Failed to delete challenge.");
    } finally {
      setDeleteBusy(false);
    }
  }

  function openLeaveConfirm(ch: ChallengeItem) {
    setMenuOpenId(null);
    setLeaveError(null);
    setConfirmLeave({ id: ch.id, title: ch.title });
  }

  async function confirmLeaveChallenge() {
    if (!confirmLeave || !me) return;
    setLeaveBusy(true);
    setLeaveError(null);

    try {
      await leaveChallenge(confirmLeave.id);
      const a = await fetchMyAcceptedChallenges(24);
      setMineAccepted(a.items);
      setConfirmLeave(null);
    } catch (e: any) {
      setLeaveError(e?.response?.data?.error ?? e?.message ?? "Failed to leave challenge.");
    } finally {
      setLeaveBusy(false);
    }
  }

  function openSubmitModal(ch: ChallengeItem) {
    setSubmitError(null);
    setSubmitFor({ id: ch.id, title: ch.title });
    setSubmitFile(null);
    setSubmitCaption("");
  }

  async function doSubmit() {
    if (!me || !submitFor) return;
    if (!submitFile) {
      setSubmitError("Please select a video file.");
      return;
    }

    setSubmitBusy(true);
    setSubmitError(null);

    try {
      await submitChallengeVideo(submitFor.id, submitFile, submitCaption.trim());
      await loadAll();
      setSubmitFor(null);
    } catch (e: any) {
      setSubmitError(e?.response?.data?.error ?? e?.message ?? "Failed to upload video.");
    } finally {
      setSubmitBusy(false);
    }
  }

  async function openViewModal(ch: ChallengeItem) {
    const winnerUserId = (ch as any)?.winner?.id ?? (ch as any)?.winnerId ?? null;
    const winnerLabel =
      (ch as any)?.winner?.displayName || (ch as any)?.winner?.username || null;

    setViewFor({ id: ch.id, title: ch.title, winnerUserId, winnerLabel });
    setViewError(null);
    setViewLoading(true);
    setSubmissions([]);

    try {
      const res = await fetchChallengeSubmissions(ch.id, 50);
      const items = Array.isArray(res) ? res : res?.items ?? [];
      setSubmissions(items);
    } catch (e: any) {
      setViewError(e?.response?.data?.error ?? e?.message ?? "Failed to load submissions.");
    } finally {
      setViewLoading(false);
    }
  }

  async function openAwardModal(ch: ChallengeItem) {
    const winnerUserId = (ch as any)?.winner?.id ?? (ch as any)?.winnerId ?? null;
    const winnerLabel =
      (ch as any)?.winner?.displayName || (ch as any)?.winner?.username || null;

    setAwardFor({ id: ch.id, title: ch.title, winnerUserId, winnerLabel });
    setAwardError(null);
    setAwardLoading(true);
    setAwardItems([]);

    try {
      const res = await fetchChallengeSubmissions(ch.id, 50);
      setAwardItems(res.items ?? []);
    } catch (e: any) {
      setAwardError(e?.response?.data?.error ?? e?.message ?? "Failed to load submissions.");
    } finally {
      setAwardLoading(false);
    }
  }

  async function pickWinner(winnerUserId: string) {
    if (!awardFor || !me) return;

    setAwardBusy(true);
    setAwardError(null);
    try {
      await setChallengeWinner(awardFor.id, winnerUserId);
      await loadAll();

      // If View modal is open for same challenge — update winner label there too
      setViewFor((prev) => {
        if (!prev) return prev;
        if (prev.id !== awardFor.id) return prev;

        const chosen = awardItems.find((x) => x.user?.id === winnerUserId);
        const label = chosen?.user?.displayName || chosen?.user?.username || prev.winnerLabel || null;

        return { ...prev, winnerUserId, winnerLabel: label };
      });

      setAwardFor(null);
    } catch (e: any) {
      setAwardError(e?.response?.data?.error ?? e?.message ?? "Failed to set winner.");
    } finally {
      setAwardBusy(false);
    }
  }

  return (
    <div className="chPage">
      <div className="chTop">
        <div className="chTitle">
          <h1>Challenges</h1>
          <p>Pick a challenge, practice, upload your video, and grow with the community.</p>
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
            acceptedSet={acceptedSet}
            meId={me?.id}
            menuOpenId={menuOpenId}
            setMenuOpenId={setMenuOpenId}
            onDelete={openDeleteConfirm}
            onLeave={openLeaveConfirm}
            onOpenView={openViewModal}
          />

          <Section
            icon={<FiStar />}
            title="New Challenges"
            subtitle="Fresh challenges created recently"
            items={latest}
            me={!!me}
            onAccept={onAccept}
            acceptedSet={acceptedSet}
            meId={me?.id}
            menuOpenId={menuOpenId}
            setMenuOpenId={setMenuOpenId}
            onDelete={openDeleteConfirm}
            onLeave={openLeaveConfirm}
            onOpenView={openViewModal}
          />

          <div className="chDivider" />

          <div className="chMyBlock">
            <div className="chMyHead">
              <h2>My Challenges</h2>
              <p>Your accepted and created challenges in one place.</p>
            </div>

            <div className="chSplit">
              <Section
                icon={<FiCheckCircle />}
                title="My Accepted"
                subtitle={me ? "Challenges you joined" : "Sign in to see your accepted challenges"}
                items={mineAccepted}
                me={!!me}
                onAccept={onAccept}
                acceptedSet={acceptedSet}
                compact
                meId={me?.id}
                menuOpenId={menuOpenId}
                setMenuOpenId={setMenuOpenId}
                onDelete={openDeleteConfirm}
                onLeave={openLeaveConfirm}
                variant="myAccepted"
                onOpenSubmit={openSubmitModal}
                onOpenView={openViewModal}
              />

              <Section
                icon={<FiPlus />}
                title="My Created"
                subtitle={me ? "Challenges you created" : "Sign in to create and manage your challenges"}
                items={mineCreated}
                me={!!me}
                onAccept={onAccept}
                acceptedSet={acceptedSet}
                compact
                meId={me?.id}
                menuOpenId={menuOpenId}
                setMenuOpenId={setMenuOpenId}
                onDelete={openDeleteConfirm}
                onLeave={openLeaveConfirm}
                onOpenView={openViewModal}
                variant="myCreated"
                onOpenAward={openAwardModal}
              />
            </div>
          </div>
        </>
      )}

      {/* CREATE MODAL */}
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
              <button className="chModalClose" onClick={() => setIsCreateOpen(false)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="chForm">
              <label>
                <span>Challenge Title</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. 7-Day High Heels Combo"
                  maxLength={80}
                />
              </label>

              <label>
                <span>Description</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
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
                    onChange={(e) => setForm((p) => ({ ...p, level: e.target.value as ChallengeLevel }))}
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
                    onChange={(e) => setForm((p) => ({ ...p, style: e.target.value }))}
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
                  onChange={(e) => setForm((p) => ({ ...p, durationDays: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span>Example Video (optional)</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setForm((p) => ({ ...p, exampleFile: e.target.files?.[0] ?? null }))}
                />
                <small>Upload a short video showing how the challenge should look.</small>
              </label>

              {createError && <div className="chError">{createError}</div>}

              <div className="chActions">
                <button className="chBtnGhost" onClick={() => setIsCreateOpen(false)} disabled={createBusy}>
                  Cancel
                </button>
                <button className="chBtnPrimary" onClick={onCreate} disabled={!canCreate || createBusy || !me}>
                  {createBusy ? "Creating..." : "Create Challenge"}
                </button>
              </div>

              {!me && <div className="chHint">Please sign in to create a challenge.</div>}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {confirmDelete && (
        <div
          className="chModalOverlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deleteBusy) setConfirmDelete(null);
          }}
        >
          <div className="chModal chConfirmModal">
            <div className="chModalHead">
              <div>
                <h2>Delete challenge?</h2>
                <p>
                  This will permanently delete <b>{confirmDelete.title}</b>. This action cannot be undone.
                </p>
              </div>
              <button
                className="chModalClose"
                onClick={() => !deleteBusy && setConfirmDelete(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {deleteError && <div className="chError">{deleteError}</div>}

            <div className="chActions">
              <button className="chBtnGhost" onClick={() => setConfirmDelete(null)} disabled={deleteBusy}>
                Cancel
              </button>
              <button className="chBtnDanger" onClick={confirmDeleteChallenge} disabled={deleteBusy}>
                {deleteBusy ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM LEAVE MODAL */}
      {confirmLeave && (
        <div
          className="chModalOverlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !leaveBusy) setConfirmLeave(null);
          }}
        >
          <div className="chModal chConfirmModal">
            <div className="chModalHead">
              <div>
                <h2>Leave challenge?</h2>
                <p>
                  You will leave <b>{confirmLeave.title}</b>.
                </p>
              </div>
              <button
                className="chModalClose"
                onClick={() => !leaveBusy && setConfirmLeave(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {leaveError && <div className="chError">{leaveError}</div>}

            <div className="chActions">
              <button className="chBtnGhost" onClick={() => setConfirmLeave(null)} disabled={leaveBusy}>
                Cancel
              </button>
              <button className="chBtnDanger" onClick={confirmLeaveChallenge} disabled={leaveBusy}>
                {leaveBusy ? "Leaving..." : "Leave"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUBMIT MODAL */}
      {submitFor && (
        <div
          className="chModalOverlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !submitBusy) setSubmitFor(null);
          }}
        >
          <div className="chModal">
            <div className="chModalHead">
              <div>
                <h2>Upload your submission</h2>
                <p>
                  Challenge: <b>{submitFor.title}</b>
                </p>
              </div>
              <button className="chModalClose" onClick={() => !submitBusy && setSubmitFor(null)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="chForm">
              <label>
                <span>Video</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setSubmitFile(e.target.files?.[0] ?? null)}
                  disabled={submitBusy}
                />
                <small>Select a video with your performance.</small>
              </label>

              <label>
                <span>Caption</span>
                <textarea
                  value={submitCaption}
                  onChange={(e) => setSubmitCaption(e.target.value)}
                  placeholder="Write a short caption (optional)…"
                  rows={3}
                  maxLength={300}
                  disabled={submitBusy}
                />
              </label>

              {submitError && <div className="chError">{submitError}</div>}

              <div className="chActions">
                <button className="chBtnGhost" onClick={() => setSubmitFor(null)} disabled={submitBusy}>
                  Cancel
                </button>
                <button className="chBtnPrimary" onClick={doSubmit} disabled={submitBusy || !submitFile}>
                  {submitBusy ? "Uploading..." : "Upload"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW SUBMISSIONS MODAL */}
      {viewFor && (
        <div
          className="chModalOverlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !viewLoading) setViewFor(null);
          }}
        >
          <div className="chModal">
            <div className="chModalHead">
              <div>
                <h2>Submissions</h2>
                <p>
                  Challenge: <b>{viewFor.title}</b>
                </p>

                {viewFor.winnerLabel ? (
                  <div className="chWinnerLine">
                    <span className="chWinnerPill">
                      <FiAward /> Winner: <b>{viewFor.winnerLabel}</b>
                    </span>
                  </div>
                ) : null}
              </div>

              <button className="chModalClose" onClick={() => !viewLoading && setViewFor(null)} aria-label="Close">
                ×
              </button>
            </div>

            {viewLoading && <div className="chEmpty">Loading...</div>}
            {!viewLoading && viewError && <div className="chError">{viewError}</div>}

            {!viewLoading && !viewError && (
              <div className="chSubmissionsList">
                {submissions.length === 0 ? (
                  <div className="chEmpty">No submissions yet.</div>
                ) : (
                  submissions.map((s) => {
                    const uid = s.user?.id;
                    const isWinner = !!uid && uid === viewFor.winnerUserId;

                    return (
                      <div
                        key={s.id}
                        className={isWinner ? "chSubmissionCard chSubmissionCardWinner" : "chSubmissionCard"}
                      >
                        <div className="chSubmissionAuthor">
                          <span>{s.user?.displayName || s.user?.username || "Participant"}</span>

                          {isWinner ? (
                            <span className="chWinnerTag" title="Winner">
                              <FiAward /> Winner
                            </span>
                          ) : null}
                        </div>

                        <video className="chSubmissionVideo" src={s.videoUrl} controls playsInline />

                        {s.caption ? <div className="chSubmissionCaption">{s.caption}</div> : null}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            <div className="chActions">
              <button className="chBtnGhost" onClick={() => setViewFor(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AWARD WINNER MODAL */}
      {awardFor && (
        <div
          className="chModalOverlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !awardBusy) setAwardFor(null);
          }}
        >
          <div className="chModal">
            <div className="chModalHead">
              <div>
                <h2 className="chAwardHead">
                  <FiAward /> Select winner
                </h2>
                <p className="chAwardSub">
                  Challenge: <b>{awardFor.title}</b>
                </p>

                {awardFor.winnerLabel ? (
                  <div className="chWinnerLine">
                    <span className="chWinnerPill">
                      <FiCheck /> Current winner: <b>{awardFor.winnerLabel}</b>
                    </span>
                  </div>
                ) : null}
              </div>

              <button className="chModalClose" onClick={() => !awardBusy && setAwardFor(null)} aria-label="Close">
                ×
              </button>
            </div>

            {awardLoading && <div className="chEmpty">Loading...</div>}
            {!awardLoading && awardError && <div className="chError">{awardError}</div>}

            {!awardLoading && !awardError && (
              <div className="chSubmissionsList">
                {awardItems.length === 0 ? (
                  <div className="chEmpty">No submissions yet.</div>
                ) : (
                  awardItems.map((s) => {
                    const uid = s.user?.id;
                    const isCurrent = !!uid && uid === awardFor.winnerUserId;

                    return (
                      <div key={s.id} className={isCurrent ? "chSubmissionCard chSubmissionCardWinner" : "chSubmissionCard"}>
                        <div className="chSubmissionAuthor">
                          <span>{s.user?.displayName || s.user?.username || "Participant"}</span>

                          {isCurrent ? (
                            <span className="chWinnerTag" title="Winner">
                              <FiCheck /> Winner
                            </span>
                          ) : null}
                        </div>

                        <video className="chSubmissionVideo" src={s.videoUrl} controls playsInline />

                        {s.caption ? <div className="chSubmissionCaption">{s.caption}</div> : null}

                        <div className="chSubmitPickRow">
                          <button
                            className="chBtnPrimary"
                            disabled={awardBusy || !uid || isCurrent}
                            onClick={() => uid && pickWinner(uid)}
                            title={isCurrent ? "Already winner" : "Pick as winner"}
                          >
                            <FiAward /> {isCurrent ? "Winner" : "Pick winner"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            <div className="chActions">
              <button className="chBtnGhost" onClick={() => setAwardFor(null)} disabled={awardBusy}>
                Close
              </button>
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
  acceptedSet: Set<string>;
  compact?: boolean;

  meId?: string;
  menuOpenId: string | null;
  setMenuOpenId: (id: string | null) => void;
  onDelete: (ch: ChallengeItem) => void;
  onLeave: (ch: ChallengeItem) => void;

  variant?: "default" | "myAccepted" | "myCreated";
  onOpenSubmit?: (ch: ChallengeItem) => void;
  onOpenView: (ch: ChallengeItem) => void;
  onOpenAward?: (ch: ChallengeItem) => void;
}) {
  const {
    icon,
    title,
    subtitle,
    items,
    me,
    onAccept,
    acceptedSet,
    compact,
    meId,
    menuOpenId,
    setMenuOpenId,
    onDelete,
    onLeave,
    variant = "default",
    onOpenSubmit,
    onOpenView,
    onOpenAward,
  } = props;

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
          {items.map((c) => {
            const isOwner = !!meId && (c as any)?.creator?.id === meId;
            const isAccepted = acceptedSet.has(c.id);
            const canLeave = me && isAccepted && !isOwner;
            const showMenu = isOwner || canLeave;
            const hasSubmissions = (c as any)?._count?.submissions > 0;

            const winnerLabel =
              (c as any)?.winner?.displayName || (c as any)?.winner?.username || null;

            return (
              <div className="chCard" key={c.id}>
                {showMenu && (
                  <div className="chKebabWrap">
                    <button
                      className="chKebabBtn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === c.id ? null : c.id);
                      }}
                      aria-label="Challenge menu"
                      title="More"
                    >
                      <FiMoreHorizontal />
                    </button>

                    {menuOpenId === c.id && (
                      <div className="chKebabMenu" onMouseDown={(e) => e.stopPropagation()}>
                        {canLeave && (
                          <button className="chKebabItem chKebabDanger" onClick={() => onLeave(c)}>
                            <FiXCircle />
                            <span>Leave challenge</span>
                          </button>
                        )}

                        {isOwner && (
                          <button className="chKebabItem chKebabDanger" onClick={() => onDelete(c)}>
                            <FiTrash2 />
                            <span>Delete challenge</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="chCardTop">
                  <div className="chCardTitle">{c.title}</div>
                  <div className="chBadge">
                    {levelLabel(c.level)} • {c.style}
                  </div>

                  {winnerLabel ? (
                    <div className="chWinnerBadge">
                      <FiAward /> Winner: {winnerLabel}
                    </div>
                  ) : null}
                </div>

                <div className="chDesc">{c.description}</div>

                <div className="chMeta">
                  <div className="chMetaItem">
                    <FiClock />
                    <span>{Math.max(0, daysLeft(c.endsAt))} days left</span>
                  </div>
                  <div className="chMetaItem">
                    <span>{(c as any)._count?.participants ?? 0} accepted</span>
                    <span>•</span>
                    <span>{(c as any)._count?.submissions ?? 0} videos</span>
                  </div>
                </div>

                <div className="chCardActions">
                  {c.exampleVideoUrl ? (
                    <a className="chBtnGhost" href={c.exampleVideoUrl} target="_blank" rel="noreferrer">
                      Watch Example
                    </a>
                  ) : (
                    <button className="chBtnGhost" disabled title="No example video provided">
                      Watch Example
                    </button>
                  )}

                  {hasSubmissions ? (
                    <button className="chBtnGhost" onClick={() => onOpenView(c)} title="View submissions">
                      <FiPlayCircle /> View submissions
                    </button>
                  ) : null}

                  {variant === "myAccepted" ? (
                    isOwner ? (
                      <button
                        className="chBtnGhost"
                        disabled
                        title="As the creator, you can only upload the example video"
                      >
                        <FiUploadCloud /> Upload disabled
                      </button>
                    ) : (
                      <button
                        className="chBtnPrimary"
                        onClick={() => onOpenSubmit?.(c)}
                        disabled={!me}
                        title={!me ? "Sign in to upload" : "Upload your video"}
                      >
                        <FiUploadCloud /> Upload my video
                      </button>
                    )
                  ) : variant === "myCreated" ? (
                    <button
                      className="chBtnPrimary"
                      onClick={() => onOpenAward?.(c)}
                      disabled={!me || !isOwner}
                      title={!isOwner ? "Only creator can award a winner" : "Select winner"}
                    >
                      <FiAward /> {winnerLabel ? "Change winner" : "Award winner"}
                    </button>
                  ) : (
                    <button
                      className={isAccepted ? "chBtnAccepted" : "chBtnPrimary"}
                      disabled={!me || isAccepted}
                      onClick={() => (isAccepted ? null : onAccept(c.id))}
                      title={
                        !me
                          ? "Please sign in to accept challenges"
                          : isAccepted
                          ? "Already accepted"
                          : "Accept"
                      }
                    >
                      {isAccepted ? "Accepted" : "Accept"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
