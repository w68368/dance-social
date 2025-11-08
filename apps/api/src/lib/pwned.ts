// apps/api/src/lib/pwned.ts
import crypto from "crypto";

/**
 * Возвращает число найденных утечек для пароля (0 = не найден).
 * Использует k-anonymity API: отправляем только префикс SHA-1 (первые 5 символов).
 * Док: https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange
 */
export async function pwnedCount(password: string): Promise<number> {
  const sha1 = crypto
    .createHash("sha1")
    .update(password)
    .digest("hex")
    .toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { "Add-Padding": "true" }, // защита от корреляции размера ответа
  });
  if (!res.ok) {
    throw new Error(`HIBP failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();

  // Ответ: строки формата "SUFFIX:COUNT"
  for (const line of text.split("\n")) {
    const [suf, countStr] = line.trim().split(":");
    if (suf === suffix) {
      const n = parseInt(countStr, 10);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}
