// apps/web/src/pages/Settings.tsx
import { useEffect, useMemo, useState } from "react";
import {
  api,
  updateAvatar,
  updateNickname,
  changeEmailPasswordProof,
  changeEmailStart,
  changeEmailVerify,
} from "../api";
import { getUser, setUser } from "../lib/auth";
import type { PublicUser } from "../lib/auth";
import "../styles/pages/settings.css";

type EmailStep = "password" | "newEmail" | "code" | "done";

export default function Settings() {
  const [me, setMe] = useState<PublicUser | null>(getUser());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // avatar upload state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // nickname modal state
  const [nickOpen, setNickOpen] = useState(false);
  const [nickValue, setNickValue] = useState("");
  const [nickBusy, setNickBusy] = useState(false);
  const [nickError, setNickError] = useState<string | null>(null);

  // email change modal state
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailStep, setEmailStep] = useState<EmailStep>("password");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [emailPassword, setEmailPassword] = useState("");
  const [emailProof, setEmailProof] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");

  const avatarPreview = useMemo(() => {
    if (!avatarFile) return null;
    return URL.createObjectURL(avatarFile);
  }, [avatarFile]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { data } = await api.get("/auth/me");
        if (!alive) return;

        if (!data?.ok || !data?.user) {
          setError("Failed to load account info.");
          setLoading(false);
          return;
        }

        const u: PublicUser = data.user;
        setMe(u);
        setUser(u);
      } catch (err: any) {
        if (!alive) return;
        setError(
          err?.response?.data?.message ??
            "Failed to load settings. Please try again."
        );
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const username = me?.username ? `@${me.username}` : "—";
  const displayName = me?.displayName || me?.username || "—";
  const email = me?.email || "—";
  const joined = me?.createdAt
    ? new Date(me.createdAt).toLocaleDateString()
    : "—";

  const currentAvatar = me?.avatarUrl || "/uploads/_noavatar.png";

  const onPickAvatar = (file: File | null) => {
    setAvatarError(null);
    if (!file) {
      setAvatarFile(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setAvatarError("Please select an image file.");
      setAvatarFile(null);
      return;
    }

    // 5MB safety (backend also limits)
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("Max avatar size is 5MB.");
      setAvatarFile(null);
      return;
    }

    setAvatarFile(file);
  };

  const saveAvatar = async () => {
    if (!avatarFile) return;

    setAvatarBusy(true);
    setAvatarError(null);

    try {
      const res = await updateAvatar(avatarFile);
      if (res.data?.ok && res.data.user) {
        setMe(res.data.user);
        setUser(res.data.user); // 🔥 instantly updates header via onAuthChange
        setAvatarFile(null);
      } else {
        setAvatarError("Failed to update avatar.");
      }
    } catch (err: any) {
      setAvatarError(err?.response?.data?.message || "Failed to update avatar.");
    } finally {
      setAvatarBusy(false);
    }
  };

  // ---------- Nickname (displayName + @slug) ----------
  const slugify = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "");

  const openNickModal = () => {
    setNickError(null);
    setNickValue(me?.displayName || me?.username || "");
    setNickOpen(true);
  };

  const closeNickModal = () => {
    if (nickBusy) return;
    setNickOpen(false);
  };

  const saveNickname = async () => {
    const value = nickValue.trim();
    setNickError(null);

    if (!value) {
      setNickError("Nickname is required.");
      return;
    }
    if (value.length < 2 || value.length > 40) {
      setNickError("Nickname must be between 2 and 40 characters.");
      return;
    }

    setNickBusy(true);
    try {
      const res = await updateNickname(value);
      if (res.data?.ok && res.data.user) {
        setMe(res.data.user);
        setUser(res.data.user);
        setNickOpen(false);
      } else {
        setNickError("Failed to update nickname.");
      }
    } catch (err: any) {
      setNickError(
        err?.response?.data?.message || "Failed to update nickname."
      );
    } finally {
      setNickBusy(false);
    }
  };

  // ---------- Change email modal ----------
  const openEmailModal = () => {
    setEmailError(null);
    setEmailBusy(false);
    setEmailStep("password");

    setEmailPassword("");
    setEmailProof(null);

    setNewEmail("");
    setEmailCode("");

    setEmailOpen(true);
  };

  const closeEmailModal = () => {
    if (emailBusy) return;
    setEmailOpen(false);
  };

  const validateEmail = (v: string) => {
    const s = v.trim().toLowerCase();
    // simple email check (backend is strict anyway)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  };

  const submitEmailPassword = async () => {
    setEmailError(null);

    const pwd = emailPassword.trim();
    if (!pwd || pwd.length < 6) {
      setEmailError("Please enter your password.");
      return;
    }

    setEmailBusy(true);
    try {
      const proof = await changeEmailPasswordProof(pwd);
      setEmailProof(proof);
      setEmailStep("newEmail");
    } catch (err: any) {
      setEmailError(err?.message || "Invalid password.");
    } finally {
      setEmailBusy(false);
    }
  };

  const submitNewEmail = async () => {
    setEmailError(null);

    const target = newEmail.trim().toLowerCase();
    if (!validateEmail(target)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    if (target === (me?.email || "").toLowerCase()) {
      setEmailError("This is already your current email.");
      return;
    }
    if (!emailProof) {
      setEmailError("Missing proof token. Please restart.");
      setEmailStep("password");
      return;
    }

    setEmailBusy(true);
    try {
      await changeEmailStart(target, emailProof);
      setEmailStep("code");
      setEmailCode("");
    } catch (err: any) {
      setEmailError(err?.message || "Failed to send verification code.");
    } finally {
      setEmailBusy(false);
    }
  };

  const submitEmailCode = async () => {
    setEmailError(null);

    const code = emailCode.trim();
    const target = newEmail.trim().toLowerCase();

    if (!target || !validateEmail(target)) {
      setEmailError("Invalid email. Please go back and re-enter it.");
      setEmailStep("newEmail");
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setEmailError("Please enter the 6-digit code.");
      return;
    }

    setEmailBusy(true);
    try {
      const updated = await changeEmailVerify(target, code);
      setMe(updated);
      setUser(updated);
      setEmailStep("done");
    } catch (err: any) {
      setEmailError(err?.message || "Incorrect code.");
    } finally {
      setEmailBusy(false);
    }
  };

  const emailStepTitle =
    emailStep === "password"
      ? "Confirm password"
      : emailStep === "newEmail"
      ? "Enter new email"
      : emailStep === "code"
      ? "Verify code"
      : "Done";

  return (
    <main className="su-main">
      <div className="container settings-container">
        <div className="settings-top">
          <h1 className="page-title settings-title">Settings</h1>
          <p className="settings-subtitle">Manage your account information.</p>
        </div>

        {loading && <p className="settings-info">Loading…</p>}

        {error && !loading && (
          <div className="settings-error">
            <p>{error}</p>
            <button
              className="btn"
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ✅ Avatar */}
            <section className="settings-section">
              <h2 className="settings-section-title">Avatar</h2>

              <div className="settings-card settings-avatar-card">
                <div className="settings-avatar-left">
                  <img
                    className="settings-avatar-img"
                    src={avatarPreview || currentAvatar}
                    alt="avatar"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        "/uploads/_noavatar.png";
                    }}
                  />
                </div>

                <div className="settings-avatar-right">
                  <div className="settings-avatar-actions">
                    <label
                      className="settings-avatar-action"
                      title="Change your profile picture"
                    >
                      Change avatar
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          onPickAvatar(e.target.files?.[0] ?? null)
                        }
                        disabled={avatarBusy}
                      />
                    </label>

                    <button
                      className="btn"
                      type="button"
                      onClick={saveAvatar}
                      disabled={!avatarFile || avatarBusy}
                    >
                      {avatarBusy ? "Saving…" : "Save avatar"}
                    </button>

                    {avatarFile && (
                      <button
                        className="btn"
                        type="button"
                        onClick={() => setAvatarFile(null)}
                        disabled={avatarBusy}
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  {avatarError && (
                    <div className="settings-avatar-error">{avatarError}</div>
                  )}

                  <p className="settings-avatar-hint">
                    JPG/PNG/WebP, up to 5MB.
                  </p>
                </div>
              </div>
            </section>

            {/* ✅ Account info */}
            <section className="settings-section">
              <h2 className="settings-section-title">Account info</h2>

              <div className="settings-card settings-card--info">
                <div className="settings-info-grid">
                  <div className="settings-info-item">
                    <div className="settings-info-label">Username</div>
                    <div className="settings-info-value">{username}</div>
                  </div>

                  <div className="settings-info-item">
                    <div className="settings-info-label">Display name</div>
                    <div className="settings-info-value">{displayName}</div>
                  </div>

                  <div className="settings-info-item">
                    <div className="settings-info-label">Email</div>
                    <div className="settings-info-value">{email}</div>
                  </div>

                  <div className="settings-info-item">
                    <div className="settings-info-label">Joined</div>
                    <div className="settings-info-value">{joined}</div>
                  </div>
                </div>
              </div>
            </section>

            {/* ✅ Manage */}
            <section className="settings-section">
              <h2 className="settings-section-title">Manage</h2>

              <div className="settings-grid">
                <div className="settings-card">
                  <h3 className="settings-card-title">Profile</h3>
                  <p className="settings-card-text">
                    Change your display name and generate a new @slug.
                  </p>
                  <button
                    className="settings-action-btn settings-action-btn--gold"
                    type="button"
                    onClick={openNickModal}
                  >
                    Change nickname
                  </button>

                </div>

                <div className="settings-card">
                  <h3 className="settings-card-title">Email</h3>
                  <p className="settings-card-text">
                    Update your email address and verify it.
                  </p>
                  <button
                    className="settings-action-btn settings-action-btn--gold"
                    type="button"
                    onClick={openEmailModal}
                  >
                    Change email
                  </button>
                </div>

                <div className="settings-card">
                  <h3 className="settings-card-title">Password</h3>
                  <p className="settings-card-text">
                    Change your password (recommended regularly).
                  </p>
                  <button className="btn" type="button" disabled>
                    Coming soon
                  </button>
                </div>

                <div className="settings-card">
                  <h3 className="settings-card-title">Security</h3>
                  <p className="settings-card-text">
                    Sessions, logout from all devices, etc.
                  </p>
                  <button className="btn" type="button" disabled>
                    Coming soon
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

{/* ✅ Nickname modal */}
{nickOpen && (
  <div className="su-modal-backdrop" onClick={closeNickModal}>
    <div className="su-modal" onClick={(e) => e.stopPropagation()}>
      <div className="su-modal-header">
        <h3 className="su-modal-title">Change nickname</h3>
        <button
          className="su-modal-close"
          type="button"
          onClick={closeNickModal}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="su-modal-body">
        <label className="su-field">
          <span className="su-field-label">New nickname</span>
          <input
            className="su-input"
            value={nickValue}
            onChange={(e) => setNickValue(e.target.value)}
            placeholder="e.g. Anastasiya B."
            disabled={nickBusy}
            autoFocus
          />
        </label>

        <div className="su-hint">
          Preview: <strong>{nickValue.trim() || "—"}</strong>{" "}
          <span className="su-hint-muted">(@{slugify(nickValue) || "slug"})</span>
        </div>

        {nickError && <div className="su-error">{nickError}</div>}
      </div>

      <div className="su-modal-footer">
        <button
          className="su-btn su-btn--ghost"
          type="button"
          onClick={closeNickModal}
          disabled={nickBusy}
        >
          Cancel
        </button>
        <button
          className="su-btn su-btn--primary"
          type="button"
          onClick={saveNickname}
          disabled={nickBusy}
        >
          {nickBusy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  </div>
)}


      {/* ✅ Change email modal */}
{emailOpen && (
  <div className="su-modal-backdrop" onClick={closeEmailModal}>
    <div className="su-modal" onClick={(e) => e.stopPropagation()}>
      <div className="su-modal-header">
        <h3 className="su-modal-title">Change email</h3>
        <button
          className="su-modal-close"
          type="button"
          onClick={closeEmailModal}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="su-modal-body">
        <div className="su-hint" style={{ marginBottom: 10 }}>
          Step: <strong>{emailStepTitle}</strong>
        </div>

        {emailStep === "password" && (
          <>
            <label className="su-field">
              <span className="su-field-label">Current password</span>
              <input
                className="su-input"
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={emailBusy}
                autoFocus
              />
            </label>
            <div className="su-hint su-hint-muted">
              We need your password to protect your account.
            </div>
          </>
        )}

        {emailStep === "newEmail" && (
          <>
            <label className="su-field">
              <span className="su-field-label">New email</span>
              <input
                className="su-input"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="new@email.com"
                disabled={emailBusy}
                autoFocus
              />
            </label>
            <div className="su-hint su-hint-muted">
              We will send a 6-digit code to this email.
            </div>
          </>
        )}

        {emailStep === "code" && (
          <>
            <div className="su-hint">
              Code sent to: <strong>{newEmail.trim().toLowerCase()}</strong>
            </div>

            <label className="su-field" style={{ marginTop: 10 }}>
              <span className="su-field-label">Verification code</span>
              <input
                className="su-input"
                value={emailCode}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, "");
                  setEmailCode(v.slice(0, 6));
                }}
                placeholder="123456"
                inputMode="numeric"
                disabled={emailBusy}
                autoFocus
              />
            </label>

            <div className="su-hint su-hint-muted">
              Enter the 6-digit code (valid for a limited time).
            </div>
          </>
        )}

        {emailStep === "done" && (
          <div className="su-hint">
            ✅ Email updated successfully to <strong>{me?.email}</strong>
          </div>
        )}

        {emailError && <div className="su-error">{emailError}</div>}
      </div>

      <div className="su-modal-footer">
        <button
          className="su-btn su-btn--ghost"
          type="button"
          onClick={closeEmailModal}
          disabled={emailBusy}
        >
          {emailStep === "done" ? "Close" : "Cancel"}
        </button>

        {emailStep !== "done" && (
          <div style={{ display: "flex", gap: 8 }}>
            {(emailStep === "newEmail" || emailStep === "code") && (
              <button
                className="su-btn su-btn--ghost"
                type="button"
                onClick={() => {
                  if (emailBusy) return;
                  setEmailError(null);
                  setEmailStep(emailStep === "newEmail" ? "password" : "newEmail");
                }}
                disabled={emailBusy}
              >
                Back
              </button>
            )}

            <button
              className="su-btn su-btn--primary"
              type="button"
              onClick={() => {
                if (emailStep === "password") return submitEmailPassword();
                if (emailStep === "newEmail") return submitNewEmail();
                if (emailStep === "code") return submitEmailCode();
              }}
              disabled={emailBusy}
            >
              {emailBusy
                ? "Please wait…"
                : emailStep === "password"
                ? "Continue"
                : emailStep === "newEmail"
                ? "Send code"
                : "Verify"}
            </button>
          </div>
        )}
      </div>
    </div>
  </div>
)}

    </main>
  );
}
