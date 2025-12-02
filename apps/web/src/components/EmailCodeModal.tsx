import { useEffect, useState } from "react";
import "../styles/pages/auth.css";

interface Props {
  email: string;
  open: boolean;
  onClose: () => void;
  onVerified: (accessToken: string, user: any) => void;

  /** Triggers resending the code (should call /auth/register-start with the form) */
  onResend: () => Promise<void>;

  /** How many seconds to wait before the “send again” button becomes active */
  cooldownSec?: number;
}

export default function EmailCodeModal({
  email,
  open,
  onClose,
  onVerified,
  onResend,
  cooldownSec = 30,
}: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // resend
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(cooldownSec);
  const [info, setInfo] = useState<string | null>(null);

  // reset state when modal opens
  useEffect(() => {
    if (open) {
      setCode("");
      setError(null);
      setInfo(null);
      setResending(false);
      setCooldown(cooldownSec);
    }
  }, [open, cooldownSec]);

  // ticker for countdown timer
  useEffect(() => {
    if (!open) return;
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [open, cooldown]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      // code verification — frontend calls this from outside (see Register.tsx)
      const res = await fetch("/api/auth/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await res.json();
      if (data?.ok && data?.accessToken && data?.user) {
        onVerified(data.accessToken, data.user);
      } else {
        setError(data?.error || "Verification failed");
      }
    } catch (err: any) {
      setError(err?.message || "Verification error");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      await onResend(); // trigger resending the registration form
      setInfo("Code has been resent.");
      setCooldown(cooldownSec); // restart timer
    } catch (e: any) {
      setError(
        e?.response?.data?.error ||
          e?.message ||
          "Failed to send the code. Please try again later."
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Email verification</h3>
        <p>
          We’ve sent a 6-digit code to <b>{email}</b>
        </p>

        <form className="modal-form" onSubmit={submit}>
          <input
            className="input code-input"
            type="text"
            maxLength={6}
            inputMode="numeric"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />

          {error && <div className="msg error">{error}</div>}
          {info && <div className="msg success">{info}</div>}

          <div className="modal-actions">
            <button
              className="su-btn"
              type="button"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              className="su-btn su-btn-primary"
              type="submit"
              disabled={loading || code.trim().length !== 6}
            >
              {loading ? "Verifying..." : "Verify"}
            </button>
          </div>

          <div className="modal-resend">
            <button
              className="link-btn"
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || resending}
              aria-disabled={cooldown > 0 || resending}
            >
              {cooldown > 0
                ? `Send code again (${cooldown}s)`
                : "Send code again"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
