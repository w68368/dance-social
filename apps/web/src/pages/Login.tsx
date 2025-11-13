// apps/web/src/pages/Login.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api";
import { setAccessToken } from "../lib/accessToken";
import { setUser } from "../lib/auth";
import "../styles/pages/auth.css";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // состояния для лимита и блокировки
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockMs, setLockMs] = useState<number | null>(null);

  // тикер обратного отсчёта при блокировке
  useEffect(() => {
    if (lockMs === null) return;
    if (lockMs <= 0) {
      setLockMs(null);
      return;
    }
    const id = setInterval(() => {
      setLockMs((ms) => (typeof ms === "number" ? Math.max(ms - 1000, 0) : ms));
    }, 1000);
    return () => clearInterval(id);
  }, [lockMs]);

  const lockMinutesLeft = useMemo(() => {
    if (lockMs === null) return null;
    const totalSec = Math.ceil(lockMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [lockMs]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setError(null);
    setAttemptsLeft(null);
    setLoading(true);

    try {
      const { data } = await api.post("/auth/login", {
        email: email.trim().toLowerCase(),
        password: password.trim(),
      });

      // ожидаем { ok, accessToken, user }
      if (data?.ok && data?.accessToken && data?.user) {
        setAccessToken(data.accessToken); // access — в память
        setUser(data.user); // профиль — в localStorage (+событие)
        navigate("/");
      } else {
        setError("Incorrect email or password");
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const data = err?.response?.data;

      if (status === 429) {
        setError(
          data?.error ||
            "Too many failed attempts. Account is temporarily locked."
        );
        if (typeof data?.lockRemainingMs === "number")
          setLockMs(data.lockRemainingMs);
        setAttemptsLeft(0);
      } else {
        const msg = data?.error || "Login error";
        setError(msg);
        if (typeof data?.attemptsLeft === "number") {
          setAttemptsLeft(data.attemptsLeft);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const disabled = loading || (lockMs !== null && lockMs > 0);

  return (
    <div className="auth-page">
      <form className="register-card" onSubmit={onSubmit}>
        <h2>Sign in</h2>
        <p className="register-sub">Welcome back to StepUnity.</p>

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
              disabled={disabled}
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
              required
              autoComplete="current-password"
              disabled={disabled}
            />

            {/* Ссылка Forgot password? — по центру и голубого цвета */}
            <div className="auth-forgot-right">
              <Link to="/forgot" className="auth-link-blue">
                Forgot password?
              </Link>
            </div>
          </div>

          <button
            className="su-btn su-btn-primary"
            type="submit"
            disabled={disabled}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          {attemptsLeft !== null && attemptsLeft > 0 && (
            <p className="msg warn">Attempts remaining: {attemptsLeft}</p>
          )}

          {lockMs !== null && lockMs > 0 && (
            <p className="msg error">
              Your account has been temporarily suspended. Please wait:{" "}
              {lockMinutesLeft}
            </p>
          )}

          {error && <p className="msg error">{error}</p>}

          {/* Блок: Don't have an account? Create account — по центру и голубая ссылка */}
          <div className="auth-links">
            <div className="auth-links-row">
              <span className="auth-muted">Don't have an account?</span>{" "}
              <Link to="/register" className="auth-link-blue">
                Create account
              </Link>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
