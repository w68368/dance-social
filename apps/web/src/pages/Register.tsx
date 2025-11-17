// apps/web/src/pages/Register.tsx
import type React from "react";
import { useMemo, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReCAPTCHA from "react-google-recaptcha";
import zxcvbn from "zxcvbn";
import { api } from "../api";
import { setAccessToken } from "../lib/accessToken";
import EmailCodeModal from "../components/EmailCodeModal";
import "../styles/pages/auth.css";

export default function Register() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [avatar, setAvatar] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // reCAPTCHA
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // === Модалка подтверждения e-mail ===
  const [verifyOpen, setVerifyOpen] = useState(false);

  // === Превью аватара ===
  const avatarPreview = useMemo(
    () => (avatar ? URL.createObjectURL(avatar) : null),
    [avatar]
  );
  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  // === Фокус и позиционирование overlay под полем пароля ===
  const [pwFocused, setPwFocused] = useState(false);
  const cardRef = useRef<HTMLFormElement | null>(null);
  const pwInputRef = useRef<HTMLInputElement | null>(null);
  const [pwOverlayTop, setPwOverlayTop] = useState<number>(0);

  const recomputeOverlayTop = () => {
    const card = cardRef.current?.getBoundingClientRect();
    const input = pwInputRef.current?.getBoundingClientRect();
    if (card && input) {
      const offset = input.bottom - card.top; // px от верхней границы карточки
      setPwOverlayTop(Math.max(0, Math.round(offset) + 8)); // +8px отступ ниже инпута
    }
  };

  useEffect(() => {
    if (!pwFocused) return;
    recomputeOverlayTop();
    const onResize = () => recomputeOverlayTop();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pwFocused]);

  useEffect(() => {
    if (pwFocused) {
      // при наборе пароля/валидации геометрия может меняться
      recomputeOverlayTop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, email, username, confirmPassword]);

  // === Оценка сложности пароля (0..4) и свёртка в 3 уровня ===
  const strength = useMemo(
    () => (password ? zxcvbn(password) : null),
    [password]
  );
  const score = strength?.score ?? 0;

  const { levelLabel, progressPct, colorVar } = useMemo(() => {
    // 0–1 → Very weak (33%), 2 → Weak (66%), 3–4 → Strong (100%)
    if (!password || score <= 1) {
      return {
        levelLabel: "Very weak",
        progressPct: 33,
        colorVar: "var(--pw-weak, #ff4d4f)",
      };
    }
    if (score === 2) {
      return {
        levelLabel: "Weak",
        progressPct: 66,
        colorVar: "var(--pw-mid, #faad14)",
      };
    }
    return {
      levelLabel: "Strong",
      progressPct: 100,
      colorVar: "var(--pw-strong, #52c41a)",
    };
  }, [password, score]);

  const tips = useMemo(() => {
    if (!password) return [] as string[];
    const out: string[] = [];
    const warn = strength?.feedback.warning?.trim();
    if (warn) out.push(warn);
    (strength?.feedback.suggestions || []).forEach((s) => {
      if (s && s.trim()) out.push(s.trim());
    });
    if (out.length === 0) {
      if (password.length < 8) out.push("Use at least 8 characters.");
      if (!/[0-9]/.test(password)) out.push("Add some digits (0–9).");
      if (!/[A-Z]/.test(password)) out.push("Add an uppercase letter.");
      if (!/[!@#$%^&*()_\-+=\[{\]};:,.?/~`]/.test(password))
        out.push("Add a symbol.");
    }
    return out.slice(0, 4);
  }, [password, strength]);

  const passwordsMismatch =
    confirmTouched &&
    confirmPassword.length > 0 &&
    confirmPassword !== password;

  // === Общая функция старта регистрации (первая отправка и «resend code») ===
  const startRegistration = async () => {
    const fd = new FormData();
    fd.append("email", email.trim());
    fd.append("username", username.trim());
    fd.append("password", password);
    if (avatar) fd.append("avatar", avatar);
    // reCAPTCHA токен
    fd.append("captchaToken", captchaToken || "");

    const { data } = await api.post("/auth/register-start", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    if (!data?.ok) {
      throw new Error(data?.error || "Failed to start registration");
    }
  };

  // === Сабмит формы ===
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setConfirmTouched(true);
      return;
    }

    if (!captchaToken) {
      setError("Please confirm that you are not a robot.");
      return;
    }

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      await startRegistration();
      setSuccess("We sent a verification code to your e-mail.");
      setVerifyOpen(true);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        (typeof err?.message === "string" ? err.message : "Registration error");
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // === Успешная верификация ===
  const handleVerified = (token: string, _user: any) => {
    setAccessToken(token); // refresh-cookie ставит бэкенд, access — для UX
    setVerifyOpen(false);
    setEmail("");
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setAvatar(null);
    setCaptchaToken(null);
    navigate("/login");
  };

  // === Повторная отправка кода ===
  const handleResend = async () => {
    try {
      await startRegistration();
      setSuccess("We re-sent the verification code to your e-mail.");
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        (typeof err?.message === "string" ? err.message : "Resend error");
      setError(msg);
    }
  };

  const canSubmit =
    !loading &&
    email.trim() &&
    username.trim() &&
    password.length >= 6 &&
    confirmPassword.length >= 6 &&
    password === confirmPassword &&
    !!captchaToken;

  return (
    <div className="auth-page">
      <form className="register-card" ref={cardRef} onSubmit={onSubmit}>
        <h2 className="auth-title">Create your account</h2>
        <p className="register-sub">
          Join StepUnity — share choreography, join challenges and climb
          rankings.
        </p>

        <div className="form-grid">
          <div className="form-row">
            <label>Email</label>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-row">
            <label>Username</label>
            <input
              className="input"
              type="text"
              placeholder="nickname"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={24}
              required
              autoComplete="username"
            />
          </div>

          <div
            className="form-row form-row--password"
            style={{
              position: "relative",
              zIndex: 20,
            }} /* инпут выше overlay */
          >
            <label>Password</label>
            <input
              ref={pwInputRef}
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => {
                setPwFocused(true);
                requestAnimationFrame(() => recomputeOverlayTop());
              }}
              onBlur={() => setPwFocused(false)}
              minLength={6}
              required
              autoComplete="new-password"
              aria-invalid={passwordsMismatch ? true : undefined}
            />
          </div>

          <div className="form-row">
            <label>Confirm password</label>
            <input
              className="input"
              type="password"
              placeholder="Repeat password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => setConfirmTouched(true)}
              minLength={6}
              required
              autoComplete="new-password"
              aria-invalid={passwordsMismatch ? true : undefined}
            />
            {passwordsMismatch && (
              <div
                role="alert"
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: "var(--su-danger, #ff4d4f)",
                }}
              >
                Passwords do not match.
              </div>
            )}
          </div>

          <div className="form-row">
            <label>Avatar</label>
            <div className="avatar-preview">
              <div>
                {avatarPreview ? (
                  <img src={avatarPreview} alt="avatar preview" />
                ) : (
                  <img
                    src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72'><rect width='100%' height='100%' rx='14' ry='14' fill='%23151a22'/><text x='50%' y='52%' dominant-baseline='middle' text-anchor='middle' font-size='10' fill='%238a8aa5' font-family='system-ui'>No avatar</text></svg>"
                    alt="no avatar"
                  />
                )}
              </div>

              <input
                className="file-input"
                type="file"
                accept="image/*"
                onChange={(e) => setAvatar(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          {/* reCAPTCHA */}
          <div className="form-row">
            <label>Verification</label>

            <div className="captcha-box">
              <ReCAPTCHA
                sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY}
                onChange={(token: string | null) => setCaptchaToken(token)}
                onExpired={() => setCaptchaToken(null)}
              />
            </div>
          </div>

          <button
            className="su-btn su-btn-primary"
            type="submit"
            disabled={!canSubmit}
          >
            {loading ? "Sending code..." : "Create account"}
          </button>

          {error && <p className="msg error">{error}</p>}
          {success && <p className="msg success">{success}</p>}
        </div>

        {/* === Overlay: визуально над карточкой, геометрически под полем пароля === */}
        {pwFocused && (
          <div
            className="pw-overlay"
            style={
              {
                "--pw-progress": progressPct,
                "--pw-color": colorVar,
              } as React.CSSProperties
            }
          >
            <div
              className="pw-panel"
              style={{ top: `${pwOverlayTop}px` }}
              role="status"
              aria-live="polite"
            >
              <div className="pw-bar" aria-hidden="true">
                <div className="pw-bar__fill" />
              </div>
              <div className="pw-caption">
                <span className="pw-label">{levelLabel}</span>
              </div>

              {tips.length > 0 && (
                <ul className="pw-tips">
                  {tips.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </form>

      {/* Модалка подтверждения e-mail */}
      <EmailCodeModal
        email={email}
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        onVerified={handleVerified}
        onResend={handleResend}
        cooldownSec={30}
      />
    </div>
  );
}
