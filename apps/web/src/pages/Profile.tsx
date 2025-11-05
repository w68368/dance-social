import { useEffect, useState } from "react";
import { api } from "../api";
import type { PublicUser } from "../lib/auth";
import { getUser, setUser } from "../lib/auth";

export default function Profile() {
  const [me, setMe] = useState<PublicUser | null>(getUser());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    api
      .get("/auth/me")
      .then(({ data }) => {
        if (!alive) return;
        if (data?.ok && data?.user) {
          setMe(data.user);
          // Обновим локальный кэш пользователя (на случай, если данные изменились)
          setUser(data.user);
        }
      })
      .catch((e) => {
        if (!alive) return;
        const msg =
          e?.response?.data?.error ||
          "Failed to load profile (maybe login expired)";
        setError(msg);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="container">
        <h2>Profile</h2>
        <p className="helper">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <h2>Profile</h2>
        <p className="msg error">{error}</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="container">
        <h2>Profile</h2>
        <p className="msg error">You are not logged in.</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <h2>My profile</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "140px 1fr",
          gap: 20,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          padding: 16,
        }}
      >
        <img
          src={me.avatarUrl || "/uploads/_noavatar.png"}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              "/uploads/_noavatar.png";
          }}
          alt="avatar"
          style={{
            width: 140,
            height: 140,
            objectFit: "cover",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        />
        <div style={{ display: "grid", gap: 8 }}>
          <div>
            <b>Username:</b> {me.username}
          </div>
          <div>
            <b>Email:</b> {me.email}
          </div>
          <div className="helper">
            Profile page placeholder — editing coming soon.
          </div>
        </div>
      </div>
    </div>
  );
}
