import crypto, { randomUUID, createHash } from "crypto";
import jwt, {
  type Secret,
  type SignOptions,
  type JwtPayload,
} from "jsonwebtoken";
import type { CookieOptions } from "express";

// ====================================================
// ===================== JWT ==========================
// ====================================================

// допустимые форматы expiresIn
type ExpiresLike =
  | number
  | `${number}${"ms" | "s" | "m" | "h" | "d" | "w" | "y"}`;

const JWT_SECRET: Secret = (process.env.JWT_SECRET ?? "dev-secret") as Secret;
const ACCESS_TOKEN_TTL = (process.env.ACCESS_TOKEN_TTL ?? "15m") as ExpiresLike;

export function signAccess(userId: string) {
  const payload = { sub: userId };
  const options: SignOptions = { expiresIn: ACCESS_TOKEN_TTL };
  return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyAccess(token: string) {
  return jwt.verify(token, JWT_SECRET) as JwtPayload & { sub: string };
}

// ====================================================
// =================== HASH (SHA-256) =================
// ====================================================

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

// ====================================================
// =========== REFRESH TOKEN (RAW + COOKIE) ===========
// ====================================================

export function newRefreshRaw() {
  // raw-строка: UUID.UUID — достаточно длинная, непредсказуемая
  return `${randomUUID()}.${randomUUID()}`;
}

export function refreshCookieOptions(daysOverride?: number): CookieOptions {
  const envDays = Number(process.env.REFRESH_TOKEN_DAYS ?? 30);
  const days = typeof daysOverride === "number" ? daysOverride : envDays;
  const isProd = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProd ? true : false,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: days * 24 * 60 * 60 * 1000,
  };
}

// ====================================================
// ========= PASSWORD RESET TOKEN GENERATOR ===========
// ====================================================

/**
 * Генерируем криптографически сильный токен для сброса пароля.
 * Он:
 *  ✅ длинный (48 байт → ~64 символа base64url)
 *  ✅ не угадывается
 *  ✅ идеально подходит для одноразовых ссылок
 */
export function generateResetToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}
