import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import zxcvbn from "zxcvbn";
import { submitPasswordReset } from "../api";

import "../styles/pages/auth.css";
import "../styles/pages/reset.css";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();

  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [countdown, setCountdown] = useState(5); // countdown timer before redirect

  // === password strength overlay ===
  const [pwFocused, setPwFocused] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const pwFieldRef = useRef<HTMLInputElement | null>(null);
  const [overlayTop, setOverlayTop] = useState<number>(120);

  const canSubmit = useMemo(
    () => p1.length >= 8 && p1 === p2 && !!token,
    [p1, p2, token]
  );

  // recalculate overlay position relative to the card
  const updateOverlayPos = () => {
    if (!pwFieldRef.current || !cardRef.current) return;
    const fieldRect = pwFieldRef.current.getBoundingClientRect();
    const cardRect = cardRef.current.getBoundingClientRect();
    const offset = fieldRect.bottom - cardRect.top + 8;
    setOverlayTop(offset);
  };

  useEffect(() => {
    if (!token) navigate("/forgot", { replace: true });
  }, [token, navigate]);

  useEffect(() => {
    if (!pwFocused) return;
    updateOverlayPos();
    window.addEventListener("resize", updateOverlayPos);
    return () => window.removeEventListener("resize", updateOverlayPos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pwFocused]);

  // effect for countdown after successful reset
  useEffect(() => {
    if (!ok) return;

    setCountdown(5); // every time we enter "ok" state, start from 5 again

    const intervalId = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalId);
          navigate("/login");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [ok, navigate]);

  const pwInfo = useMemo(() => {
    if (!p1) {
      return {
        progress: 0,
        label: "Start typing your password",
        color: "var(--pw-weak)",
      };
    }

    const res = zxcvbn(p1);
    let progress = 0;
    let label = "Very weak";
    let color = "var(--pw-weak)";

    switch (res.score) {
      case 0:
      case 1:
        progress = 25;
        label = "Weak password";
        color = "var(--pw-weak)";
        break;
      case 2:
        progress = 50;
        label = "Okay, but could be stronger";
        color = "var(--pw-mid)";
        break;
      case 3:
        progress = 75;
        label = "Good password";
        color = "var(--pw-mid)";
        break;
      case 4:
        progress = 100;
        label = "Strong password";
        color = "var(--pw-strong)";
        break;
    }

    return { progress, label, color };
  }, [p1]);

  const panelStyle = useMemo(
    () =>
      ({
        "--pw-overlay-top": `${overlayTop}px`,
        "--pw-progress": pwInfo.progress,
        "--pw-color": pwInfo.color,
      } as CSSProperties),
    [overlayTop, pwInfo.progress, pwInfo.color]
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading || !canSubmit) return;

    setErr(null);
    setLoading(true);

    try {
      await submitPasswordReset(token, p1);
      setOk(true);
    } catch (e: any) {
      const serverMsg = e?.response?.data?.error || e?.response?.data?.message;

      if (serverMsg && typeof serverMsg === "string") {
        setErr(serverMsg);
      } else {
        setErr("Invalid or expired reset link. Please request a new one.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (ok) {
    const progress = (countdown / 5) * 100;

    return (
      <div className="auth-page">
        <div className="register-card reset-card">
          <h2>Password changed</h2>
          <p className="register-sub">
            Password successfully changed. Redirecting to login in{" "}
            <strong>{countdown}</strong> sec...
          </p>

          <div className="reset-timer">
            <div className="reset-timer__bar">
              <div
                className="reset-timer__fill"
                style={{ width: `${progress}%` }}
              />
            </div>

            <button
              type="button"
              className="su-btn su-btn-secondary reset-submit-btn"
              onClick={() => navigate("/login")}
            >
              Login now
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="register-card reset-card" ref={cardRef}>
        {pwFocused && (
          <div className="pw-overlay">
            <div className="pw-panel" style={panelStyle}>
              <div className="pw-bar">
                <div className="pw-bar__fill" />
              </div>
              <div className="pw-caption">
                <span className="pw-label">{pwInfo.label}</span>
              </div>
              <ul className="pw-tips">
                <li>Use at least 10–12 characters.</li>
                <li>Mix letters, numbers and symbols.</li>
                <li>Avoid dates, names and common phrases.</li>
              </ul>
            </div>
          </div>
        )}

        <h2>Set a new password</h2>
        <p className="register-sub">
          Choose a strong password for your StepUnity account.
        </p>

        <form className="form-grid" onSubmit={onSubmit}>
          <div className="form-row field--password">
            <label>New password</label>
            <input
              ref={pwFieldRef}
              className="input"
              type="password"
              required
              value={p1}
              onChange={(e) => setP1(e.target.value)}
              onFocus={() => {
                setPwFocused(true);
                updateOverlayPos();
              }}
              onBlur={() => setPwFocused(false)}
              autoComplete="new-password"
            />
          </div>

          <div className="form-row">
            <label>Repeat new password</label>
            <input
              className="input"
              type="password"
              required
              value={p2}
              onChange={(e) => setP2(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {err && (
            <div className="msg error" role="alert">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="su-btn su-btn-primary reset-submit-btn"
          >
            {loading ? "Saving..." : "Save new password"}
          </button>
        </form>
      </div>
    </div>
  );
}
