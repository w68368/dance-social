import { useMemo, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const [avatar, setAvatar] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // === Модалка подтверждения e-mail ===
  const [verifyOpen, setVerifyOpen] = useState(false);

  // Превью аватара
  const avatarPreview = useMemo(
    () => (avatar ? URL.createObjectURL(avatar) : null),
    [avatar]
  );
  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  // Оценка сложности пароля (0..4) + подсказки
  const strength = useMemo(
    () => (password ? zxcvbn(password) : null),
    [password]
  );
  const score = strength?.score ?? 0;
  const warning = strength?.feedback.warning || "";
  const suggestions = strength?.feedback.suggestions || [];

  // Общая функция старта регистрации (первичная и “отправить код ещё раз”)
  const startRegistration = async () => {
    const fd = new FormData();
    fd.append("email", email.trim());
    fd.append("username", username.trim());
    fd.append("password", password);
    if (avatar) fd.append("avatar", avatar);

    const { data } = await api.post("/auth/register-start", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    if (!data?.ok) {
      throw new Error(data?.error || "Failed to start registration");
    }
  };

  // Сабмит основной формы
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      await startRegistration(); // первая отправка формы
      setSuccess("Мы отправили код подтверждения на ваш e-mail.");
      setVerifyOpen(true); // откроется модалка; в ней кулдаун 30s на ресенд
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        (typeof err?.message === "string" ? err.message : "Registration error");
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Успешная верификация — сохраним accessToken (опционально) и перейдём на /login
  const handleVerified = (token: string, _user: any) => {
    // refresh-кука ставится сервером, accessToken сохраняем локально (если нужен для UX)
    setAccessToken(token);

    setVerifyOpen(false);
    setEmail("");
    setUsername("");
    setPassword("");
    setAvatar(null);

    navigate("/login");
  };

  // Повторная отправка кода (кнопка в модалке)
  const handleResend = async () => {
    await startRegistration();
  };

  return (
    <div className="auth-page">
      <form className="register-card" onSubmit={onSubmit}>
        <h2>Create your account</h2>
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

          <div className="form-row">
            <label>Password</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
            />

            {/* Индикатор сложности пароля */}
            <div className="pw-meter" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={
                    "pw-meter__bar " +
                    (score >= i
                      ? score <= 1
                        ? "is-weak"
                        : score === 2
                        ? "is-fair"
                        : score === 3
                        ? "is-good"
                        : "is-strong"
                      : "")
                  }
                />
              ))}
            </div>
            <div className="pw-meter__label">
              {score === 0 && password && "Very weak"}
              {score === 1 && "Weak"}
              {score === 2 && "Fair"}
              {score === 3 && "Good"}
              {score === 4 && "Strong"}
            </div>

            {(warning || suggestions.length > 0) && (
              <ul className="pw-hints">
                {warning && <li>{warning}</li>}
                {suggestions.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
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

          <button
            className="su-btn su-btn-primary"
            type="submit"
            disabled={loading}
          >
            {loading ? "Sending code..." : "Create account"}
          </button>

          {error && <p className="msg error">{error}</p>}
          {success && <p className="msg success">{success}</p>}
        </div>
      </form>

      {/* Модалка подтверждения e-mail (внутри кулдаун 30с на ресенд) */}
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
