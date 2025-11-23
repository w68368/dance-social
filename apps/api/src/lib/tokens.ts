import crypto, { randomUUID, createHash } from "crypto";
import jwt, {
  type Secret,
  type SignOptions,
  type JwtPayload,
} from "jsonwebtoken";
import type { CookieOptions } from "express";

// ====================================================
// ============ GLOBAL COOKIE CONFIG (ENV) ============
// ====================================================

// Общий домен для куки, например ".stepunity.com"
// В dev можно оставить пустым
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

// COOKIE_SAMESITE: "lax" | "strict" | "none"
// В dev обычно "lax", в проде при разных доменах фронта/бэка — "none"
const RAW_COOKIE_SAMESITE = (
  process.env.COOKIE_SAMESITE || "lax"
).toLowerCase();

const COOKIE_SAMESITE: CookieOptions["sameSite"] =
  RAW_COOKIE_SAMESITE === "none"
    ? "none"
    : RAW_COOKIE_SAMESITE === "strict"
    ? "strict"
    : "lax";

// COOKIE_SECURE: true/false
// При SameSite=None браузеры требуют secure=true
const COOKIE_SECURE =
  process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";

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

  const base: CookieOptions = {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    path: "/api/auth",
    maxAge: days * 24 * 60 * 60 * 1000,
  };

  if (COOKIE_DOMAIN) {
    base.domain = COOKIE_DOMAIN;
  }

  return base;
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
