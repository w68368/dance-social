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

// Common domain for cookies, such as ".stepunity.com"
// Can be left blank in dev
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

// COOKIE_SAMESITE: "lax" | "strict" | "none"
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
// With SameSite=None, browsers require secure=true
const COOKIE_SECURE =
  process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";

// ====================================================
// ===================== JWT ==========================
// ====================================================

type ExpiresLike =
  | number
  | `${number}${"ms" | "s" | "m" | "h" | "d" | "w" | "y"}`;

const JWT_SECRET: Secret = (process.env.JWT_SECRET ?? "dev-secret") as Secret;

const ACCESS_TOKEN_TTL = (process.env.ACCESS_TOKEN_TTL ??
  "15m") as ExpiresLike;

// Short-lived proof token for sensitive operations (e.g. email change)
const EMAIL_CHANGE_PROOF_TTL = (process.env.EMAIL_CHANGE_PROOF_TTL ??
  "10m") as ExpiresLike;

// ----------------------------------------------------
// Access token
// ----------------------------------------------------

export function signAccess(userId: string) {
  const payload = { sub: userId };
  const options: SignOptions = { expiresIn: ACCESS_TOKEN_TTL };
  return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyAccess(token: string) {
  return jwt.verify(token, JWT_SECRET) as JwtPayload & { sub: string };
}

// ----------------------------------------------------
// Email change proof token (after password confirmation)
// ----------------------------------------------------

type EmailChangeProofPayload = JwtPayload & {
  sub: string;
  purpose: "change-email";
};

export function signEmailChangeProof(userId: string) {
  const payload: EmailChangeProofPayload = {
    sub: userId,
    purpose: "change-email",
  };

  const options: SignOptions = {
    expiresIn: EMAIL_CHANGE_PROOF_TTL,
  };

  return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyEmailChangeProof(token: string) {
  const decoded = jwt.verify(token, JWT_SECRET) as EmailChangeProofPayload;

  if (decoded.purpose !== "change-email") {
    throw new Error("Invalid email change proof token");
  }

  return decoded;
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
  // raw string: UUID.UUID - quite long, unpredictable
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
 * Generate a cryptographically strong password reset token.
 * It is:
 * - long (48 bytes → ~64 characters base64url)
 * - undetectable
 * - ideal for one-time links
 */
export function generateResetToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}
