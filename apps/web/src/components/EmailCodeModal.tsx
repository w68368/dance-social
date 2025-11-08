import { useEffect, useState } from "react";
import "../styles/pages/auth.css";

interface Props {
  email: string;
  open: boolean;
  onClose: () => void;
  onVerified: (accessToken: string, user: any) => void;

  /** Вызывает повторную отправку кода (должен дернуть /auth/register-start с формой) */
  onResend: () => Promise<void>;

  /** Сколько секунд ждать до активной кнопки «отправить ещё раз» */
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

  // сбрасываем состояние при открытии
  useEffect(() => {
    if (open) {
      setCode("");
      setError(null);
      setInfo(null);
      setResending(false);
      setCooldown(cooldownSec);
    }
  }, [open, cooldownSec]);

  // тикер для таймера
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
      // проверка кода — фронт вызывает это снаружи (см. Register.tsx)
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
      await onResend(); // дергаем повторную отправку формы регистрации
      setInfo("Код отправлен повторно.");
      setCooldown(cooldownSec); // перезапуск таймера
    } catch (e: any) {
      setError(
        e?.response?.data?.error ||
          e?.message ||
          "Не удалось отправить код. Попробуйте позже."
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Подтверждение e-mail</h3>
        <p>
          Мы отправили 6-значный код на <b>{email}</b>
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
              Отмена
            </button>
            <button
              className="su-btn su-btn-primary"
              type="submit"
              disabled={loading || code.trim().length !== 6}
            >
              {loading ? "Проверяем..." : "Подтвердить"}
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
                ? `Отправить код ещё раз (${cooldown}s)`
                : "Отправить код ещё раз"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
