// apps/web/src/pages/Settings.tsx
import { useEffect, useMemo, useState } from "react";
import { api, updateAvatar } from "../api";
import { getUser, setUser } from "../lib/auth";
import type { PublicUser } from "../lib/auth";
import "../styles/pages/settings.css";

export default function Settings() {
  const [me, setMe] = useState<PublicUser | null>(getUser());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // avatar upload state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

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

            {/* ✅ Future */}
            <section className="settings-section">
              <h2 className="settings-section-title">Manage</h2>

              <div className="settings-grid">
                <div className="settings-card">
                  <h3 className="settings-card-title">Profile</h3>
                  <p className="settings-card-text">
                    Change your display name / username.
                  </p>
                  <button className="btn" type="button" disabled>
                    Coming soon
                  </button>
                </div>

                <div className="settings-card">
                  <h3 className="settings-card-title">Email</h3>
                  <p className="settings-card-text">
                    Update your email address and verify it.
                  </p>
                  <button className="btn" type="button" disabled>
                    Coming soon
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
    </main>
  );
}
