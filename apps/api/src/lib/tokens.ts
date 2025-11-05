import { randomUUID, createHash } from "crypto";
import jwt, {
  type Secret,
  type SignOptions,
  type JwtPayload,
} from "jsonwebtoken";
import type { CookieOptions } from "express";

// допустимые форматы для expiresIn
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

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function newRefreshRaw() {
  return `${randomUUID()}.${randomUUID()}`;
}

export function refreshCookieOptions(): CookieOptions {
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd ? true : false, // dev: false, prod: true
    sameSite: "lax",
    path: "/api/auth",
    maxAge: days * 24 * 60 * 60 * 1000,
  };
}
