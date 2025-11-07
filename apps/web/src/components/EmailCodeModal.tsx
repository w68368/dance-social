import { useState } from "react";
import { api } from "../api";
import "../styles/pages/auth.css";

interface Props {
  email: string;
  open: boolean;
  onClose: () => void;
  onVerified: (accessToken: string, user: any) => void;
}

export default function EmailCodeModal({
  email,
  open,
  onClose,
  onVerified,
}: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const { data } = await api.post("/auth/register-verify", {
        email: email.trim(),
        code: code.trim(),
      });

      if (data?.ok && data?.accessToken && data?.user) {
        onVerified(data.accessToken, data.user);
      } else {
        setError(data?.error || "Verification failed");
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Verification error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Подтверждение e-mail</h3>
        <p>
          На адрес <b>{email}</b> отправлен 6-значный код
        </p>

        <form onSubmit={submit}>
          <input
            className="input"
            type="text"
            maxLength={6}
            inputMode="numeric"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />

          {error && <div className="msg error">{error}</div>}

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
              disabled={loading || code.length !== 6}
            >
              {loading ? "Проверяем..." : "Подтвердить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
