import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { upload } from "../lib/upload.js";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth.js";
import {
  signAccess,
  sha256,
  newRefreshRaw,
  refreshCookieOptions,
} from "../lib/tokens.js";

const router = Router();

/* =========================
   CONST & HELPERS
========================= */
const MAX_ATTEMPTS = 4;
const LOCK_MINUTES = 5;
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);

const normalizeEmail = (v: string) => (v ?? "").trim().toLowerCase();
const normalizeUsername = (v: string) => (v ?? "").trim();
const normalizePassword = (v: string) => (v ?? "").trim();

const addDays = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

// единый ответ при неуспехе логина — не раскрываем, существует ли email
const loginFail = (res: any, extra?: Record<string, unknown>) =>
  res
    .status(401)
    .json({ ok: false, message: "Invalid email or password", ...extra });

/* =========================
   Zod схемы (без gender)
========================= */
const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(24),
  password: z.string().min(6).max(200),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
});

/* =========================
   POST /api/auth/register
   multipart/form-data (avatar)
========================= */
router.post("/register", upload.single("avatar"), async (req, res) => {
  try {
    const form = {
      email: normalizeEmail(req.body.email),
      username: normalizeUsername(req.body.username),
      password: normalizePassword(req.body.password),
    };

    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      return res
        .status(400)
        .json({
          ok: false,
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
    }

    const [byEmail, byUsername] = await Promise.all([
      prisma.user.findUnique({ where: { email: parsed.data.email } }),
      prisma.user.findUnique({ where: { username: parsed.data.username } }),
    ]);
    if (byEmail)
      return res.status(409).json({ ok: false, error: "Email already in use" });
    if (byUsername)
      return res
        .status(409)
        .json({ ok: false, error: "Username already in use" });

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    let avatarUrl: string | undefined;
    if (req.file) {
      avatarUrl = "/uploads/" + req.file.filename; // раздаётся как статика
    }

    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        username: parsed.data.username,
        passwordHash,
        avatarUrl,
      },
      select: {
        id: true,
        email: true,
        username: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    return res.status(201).json({ ok: true, user });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

/* =========================
   POST /api/auth/login
   JSON: { email, password }
   -> set-cookie: refresh=... (HttpOnly) + { accessToken, user }
========================= */
router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse({
      email: normalizeEmail(req.body.email),
      password: normalizePassword(req.body.password),
    });
    if (!parsed.success) {
      return res
        .status(400)
        .json({
          ok: false,
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
    }

    const now = new Date();
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: {
        id: true,
        email: true,
        username: true,
        avatarUrl: true,
        createdAt: true,
        passwordHash: true,
        failedLoginAttempts: true,
        lockUntil: true,
      },
    });

    if (!user) return loginFail(res);

    // Блокировка по фейлам
    if (user.lockUntil && user.lockUntil > now) {
      const lockRemainingMs = user.lockUntil.getTime() - now.getTime();
      return res.status(429).json({
        ok: false,
        error: "Account is temporarily locked due to multiple failed attempts",
        unlockAt: user.lockUntil.toISOString(),
        lockRemainingMs,
        attemptsLeft: 0,
      });
    }

    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) {
      const current = user.failedLoginAttempts ?? 0;
      const newCount = current + 1;

      if (newCount >= MAX_ATTEMPTS) {
        const unlockAt = new Date(now.getTime() + LOCK_MINUTES * 60 * 1000);
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockUntil: unlockAt },
        });
        return res.status(429).json({
          ok: false,
          error: "Too many failed attempts. Account locked for a short period.",
          unlockAt: unlockAt.toISOString(),
          lockRemainingMs: LOCK_MINUTES * 60 * 1000,
          attemptsLeft: 0,
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: newCount },
      });
      return loginFail(res, { attemptsLeft: MAX_ATTEMPTS - newCount });
    }

    // Успех — сброс счётчиков
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockUntil: null },
    });

    // === Access + Refresh ===
    const accessToken = signAccess(user.id);

    const refreshRaw = newRefreshRaw();
    const refreshHash = sha256(refreshRaw);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshHash,
        expiresAt: addDays(new Date(), REFRESH_TTL_DAYS),
        ip:
          (req.headers["x-forwarded-for"] as string) ||
          req.socket.remoteAddress ||
          "",
        userAgent: req.get("user-agent") || "",
      },
    });

    // ставим HttpOnly-куку
    res.cookie("refresh", refreshRaw, refreshCookieOptions());

    return res.json({
      ok: true,
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

/* =========================
   POST /api/auth/refresh
========================= */
router.post("/refresh", async (req, res) => {
  const raw = (req as any).cookies?.refresh as string | undefined;
  if (!raw) return res.status(401).json({ ok: false, error: "No refresh" });

  const hash = sha256(raw);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash },
  });

  if (!existing || existing.revokedAt || existing.expiresAt <= new Date()) {
    res.clearCookie("refresh", { path: "/api/auth" });
    return res.status(401).json({ ok: false, error: "Invalid refresh" });
  }

  // Ротация
  await prisma.refreshToken.update({
    where: { tokenHash: hash },
    data: { revokedAt: new Date() },
  });

  const nextRaw = newRefreshRaw();
  const nextHash = sha256(nextRaw);

  await prisma.refreshToken.create({
    data: {
      userId: existing.userId,
      tokenHash: nextHash,
      expiresAt: addDays(new Date(), REFRESH_TTL_DAYS),
      ip:
        (req.headers["x-forwarded-for"] as string) ||
        req.socket.remoteAddress ||
        "",
      userAgent: req.get("user-agent") || "",
    },
  });

  const accessToken = signAccess(existing.userId);

  res.cookie("refresh", nextRaw, refreshCookieOptions());
  return res.json({ ok: true, accessToken });
});

/* =========================
   POST /api/auth/logout
========================= */
router.post("/logout", async (req, res) => {
  const raw = (req as any).cookies?.refresh as string | undefined;
  if (raw) {
    const hash = sha256(raw);
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  res.clearCookie("refresh", { path: "/api/auth" }).json({ ok: true });
});

/* =========================
   POST /api/auth/logout-all
   требует access (Bearer)
========================= */
router.post("/logout-all", requireAuth, async (req: AuthedRequest, res) => {
  if (!req.userId) return res.status(401).json({ ok: false });
  await prisma.refreshToken.updateMany({
    where: { userId: req.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  res.clearCookie("refresh", { path: "/api/auth" }).json({ ok: true });
});

/* =========================
   GET /api/auth/me
========================= */
router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = req.userId!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
    if (!user)
      return res.status(404).json({ ok: false, error: "User not found" });

    res.json({ ok: true, user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

export default router;
