import { useState } from "react";
import { requestPasswordReset } from "../api";

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
      setSent(true); // всегда успех — бэк не раскрывает, есть почта или нет
    } catch (e: any) {
      // даже если ошибка сети — не палим детали
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="card auth-card">
        <h2>Check your email</h2>
        <p>
          If an account exists for <b>{email}</b>, we've sent reset
          instructions.
        </p>
      </div>
    );
  }

  return (
    <div className="card auth-card">
      <h2>Forgot password</h2>
      <form onSubmit={onSubmit}>
        <label>
          E-mail
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        {err && (
          <div className="error" role="alert">
            {err}
          </div>
        )}
        <button type="submit" disabled={loading}>
          {loading ? "Sending..." : "Send instructions"}
        </button>
      </form>
    </div>
  );
}
