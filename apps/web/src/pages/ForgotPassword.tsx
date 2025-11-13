import { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../api";
import "../styles/pages/auth.css";
import "../styles/pages/forgot.css";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setErr(null);
    setLoading(true);

    try {
      await requestPasswordReset(email.trim());
      // backend всегда отвечает одинаково, даже если e-mail не найден
      setSent(true);
    } catch (_e: any) {
      setErr("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // --- экран после отправки письма ---
  if (sent) {
    return (
      <div className="auth-page">
        <div className="register-card forgot-card">
          <h2>Check your email</h2>
          <p className="register-sub">
            If an account exists for <b>{email}</b>, we&apos;ve sent
            instructions to reset your password.
          </p>

          <div className="auth-links">
            <div className="auth-links-row">
              <span className="auth-muted">Remembered your password?</span>
              <Link to="/login" className="auth-link-blue">
                Back to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- основная форма forgot password (дизайн как у Sign in) ---
  return (
    <div className="auth-page">
      <form className="register-card forgot-card" onSubmit={onSubmit}>
        <h2>Forgot password</h2>
        <p className="register-sub">
          Enter your e-mail and we&apos;ll send you a link to reset your
          password.
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
              disabled={loading}
            />
            <p className="forgot-hint">
              We&apos;ll send reset instructions if this e-mail exists.
            </p>
          </div>

          {err && <p className="msg error">{err}</p>}

          <button
            className="su-btn su-btn-primary forgot-submit-btn"
            type="submit"
            disabled={loading}
          >
            {loading ? "Sending..." : "Send instructions"}
          </button>

          <div className="auth-links">
            <div className="auth-links-row">
              <span className="auth-muted">Remembered your password?</span>
              <Link to="/login" className="auth-link-blue">
                Back to login
              </Link>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
