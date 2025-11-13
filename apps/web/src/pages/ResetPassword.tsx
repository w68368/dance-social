import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { submitPasswordReset } from "../api";

// если используешь zxcvbn — можешь подсветить силу пароля
// import zxcvbn from "zxcvbn";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();

  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const canSubmit = useMemo(
    () => p1.length >= 8 && p1 === p2 && token,
    [p1, p2, token]
  );

  useEffect(() => {
    // если токена нет — редирект на /forgot
    if (!token) navigate("/forgot", { replace: true });
  }, [token, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !canSubmit) return;
    setErr(null);
    setLoading(true);
    try {
      await submitPasswordReset(token, p1);
      setOk(true);
    } catch (e: any) {
      setErr("Invalid or expired reset link. Please request a new one.");
    } finally {
      setLoading(false);
    }
  };

  if (ok) {
    return (
      <div className="card auth-card">
        <h2>Password changed</h2>
        <p>You can now log in with your new password.</p>
        <Link to="/login" className="button">
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <div className="card auth-card">
      <h2>Set a new password</h2>
      <form onSubmit={onSubmit}>
        <label>
          New password
          <input
            type="password"
            required
            value={p1}
            onChange={(e) => setP1(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label>
          Repeat new password
          <input
            type="password"
            required
            value={p2}
            onChange={(e) => setP2(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        {err && (
          <div className="error" role="alert">
            {err}
          </div>
        )}
        <button type="submit" disabled={!canSubmit || loading}>
          {loading ? "Saving..." : "Save new password"}
        </button>
      </form>
    </div>
  );
}
