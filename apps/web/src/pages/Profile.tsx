import { useEffect, useState } from "react";
import { api } from "../api";
import type { AuthUser } from "../lib/auth";
import { getUser } from "../lib/auth";

export default function Profile() {
  const [me, setMe] = useState<AuthUser | null>(getUser());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/auth/me")
      .then(({ data }) => {
        if (data?.ok && data?.user) setMe(data.user);
      })
      .catch((e) =>
        setError(e?.response?.data?.error || "Failed to load profile")
      );
  }, []);

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
        <p className="helper">Loading...</p>
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
          <div>
            <b>Gender:</b> {me.gender ?? "—"}
          </div>
          <div className="helper">
            Profile page placeholder – we'll add profile editing and avatar
            changes later.
          </div>
        </div>
      </div>
    </div>
  );
}
