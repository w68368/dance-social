import fetch from "node-fetch";

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;
const RECAPTCHA_ENABLED = process.env.RECAPTCHA_ENABLED === "true";

interface RecaptchaV2Response {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
}

export async function verifyRecaptcha(
  token?: string,
  remoteIp?: string | null
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Если выключено — пропускаем
  if (!RECAPTCHA_ENABLED) {
    console.warn("[reCAPTCHA] Disabled — skipping check");
    return { ok: true };
  }

  if (!RECAPTCHA_SECRET) {
    console.warn("[reCAPTCHA] Missing RECAPTCHA_SECRET — skipping check");
    return { ok: true };
  }

  if (!token) {
    return { ok: false, reason: "missing_token" };
  }

  const params = new URLSearchParams();
  params.append("secret", RECAPTCHA_SECRET);
  params.append("response", token);
  if (remoteIp) params.append("remoteip", remoteIp);

  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    body: params,
  });

  if (!res.ok) {
    return { ok: false, reason: "request_failed" };
  }

  // 👉 Вот здесь мы добавили тип `RecaptchaV2Response`
  const data = (await res.json()) as RecaptchaV2Response;

  if (data.success !== true) {
    console.warn("[reCAPTCHA] Verification failed:", data);
    return { ok: false, reason: "recaptcha_failed" };
  }

  return { ok: true };
}
