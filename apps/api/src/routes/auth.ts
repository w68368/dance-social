import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";
import { pwnedCount } from "../lib/pwned.js";

import { prisma } from "../lib/prisma.js";
import { upload } from "../lib/upload.js";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth.js";
import {
  signAccess,
  sha256,
  newRefreshRaw,
  refreshCookieOptions,
  generateResetToken,
} from "../lib/tokens.js";
import { sendVerificationCode, sendPasswordResetEmail } from "../lib/mailer.js";
import {
  forgotLimiter,
  resetLimiter,
  loginLimiter,
  registerStartLimiter,
  registerVerifyLimiter,
} from "../middlewares/limits.js";

const router = Router();

/* =========================
   CONST & HELPERS
========================= */
const MAX_ATTEMPTS = 4;
const LOCK_MINUTES = 5;
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_DAYS ?? 30);

// Для e-mail подтверждения
const EMAIL_CODE_TTL_MIN = Number(process.env.EMAIL_CODE_TTL_MIN ?? 10);
const EMAIL_MAX_ATTEMPTS = Number(process.env.EMAIL_MAX_ATTEMPTS ?? 5);

// Для сброса пароля
const RESET_TOKEN_TTL_MIN = Number(process.env.RESET_TOKEN_TTL_MIN ?? 30);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

// Дефолтная аватарка (файл положи в apps/api/uploads/defaults/default-avatar.png)
const DEFAULT_AVATAR_URL = "/uploads/defaults/default-avatar.png";

const normalizeEmail = (v: string) => (v ?? "").trim().toLowerCase();
const normalizeUsername = (v: string) => (v ?? "").trim();
const normalizePassword = (v: string) => (v ?? "").trim();

const addDays = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

const random6 = () => Math.floor(100000 + Math.random() * 900000).toString();

const sha256hex = (s: string) =>
  crypto.createHash("sha256").update(s).digest("hex");

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

// Forgot/Reset схемы
const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(8).max(128),
});

/* ============================================================
   NEW: Двухшаговая регистрация с e-mail кодом
   1) /register-start — присылает код и кладёт черновик
   2) /register-verify — проверяет код, создаёт User и логинит
============================================================ */

/* =========================
   POST /api/auth/register-start
   multipart/form-data (avatar optional)
========================= */
router.post(
  "/register-start",
  registerStartLimiter,
  upload.single("avatar"),
  async (req, res) => {
    try {
      const form = {
        email: normalizeEmail(req.body.email),
        username: normalizeUsername(req.body.username),
        password: normalizePassword(req.body.password),
      };

      const parsed = registerSchema.safeParse(form);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      // Уникальность
      const [byEmail, byUsername] = await Promise.all([
        prisma.user.findUnique({ where: { email: parsed.data.email } }),
        prisma.user.findUnique({ where: { username: parsed.data.username } }),
      ]);
      if (byEmail)
        return res
          .status(409)
          .json({ ok: false, error: "Email already in use" });
      if (byUsername)
        return res
          .status(409)
          .json({ ok: false, error: "Username already in use" });

      // Проверка пароля на утечки (HIBP)
      const leaks = await pwnedCount(parsed.data.password);
      if (leaks > 0) {
        return res.status(400).json({
          ok: false,
          error:
            "This password appears in known data breaches. Please choose a stronger one.",
          pwnedCount: leaks,
        });
      }

      const passwordHash = await bcrypt.hash(parsed.data.password, 10);

      // Если прислали аватар — сохраним URL (файл уже положен multer в /uploads)
      let avatarUrl: string | undefined;
      if (req.file) {
        avatarUrl = "/uploads/" + req.file.filename;
      }

      // Генерим код и сохраняем черновик
      const code = random6();
      const codeHash = sha256hex(code);
      const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MIN * 60 * 1000);

      await prisma.emailVerification.upsert({
        where: { email: parsed.data.email },
        create: {
          email: parsed.data.email,
          codeHash,
          expiresAt,
          attempts: 0,
          maxAttempts: EMAIL_MAX_ATTEMPTS,
          payload: {
            username: parsed.data.username,
            passwordHash,
            avatarUrl, // может быть undefined — это ок
          },
        },
        update: {
          codeHash,
          expiresAt,
          attempts: 0,
          maxAttempts: EMAIL_MAX_ATTEMPTS,
          payload: {
            username: parsed.data.username,
            passwordHash,
            avatarUrl,
          },
        },
      });

      // Отправляем письмо с кодом (даём понятное сообщение при ошибке SMTP)
      try {
        await sendVerificationCode(parsed.data.email, code);
      } catch (e: any) {
        console.error("[sendMail] error:", e?.message || e);
        return res.status(500).json({
          ok: false,
          error:
            "Email sending failed (SMTP). Check SMTP_* in .env or reset Mailtrap credentials.",
        });
      }

      return res.json({ ok: true, message: "Verification code sent" });
    } catch (e) {
      console.error(e);
      return res
        .status(500)
        .json({ ok: false, error: "Internal server error" });
    }
  }
);

/* =========================
   POST /api/auth/register-verify
   JSON: { email, code }
========================= */
router.post("/register-verify", registerVerifyLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = (req.body.code ?? "").toString().trim();

    if (!email || !code || code.length !== 6) {
      return res.status(400).json({ ok: false, error: "Invalid payload" });
    }

    const rec = await prisma.emailVerification.findUnique({ where: { email } });
    if (!rec)
      return res.status(400).json({ ok: false, error: "Code not found" });

    const now = new Date();
    if (rec.expiresAt < now) {
      return res.status(400).json({ ok: false, error: "Code expired" });
    }
    if (rec.attempts >= rec.maxAttempts) {
      return res.status(429).json({ ok: false, error: "Too many attempts" });
    }

    const ok = rec.codeHash === sha256hex(code);
    if (!ok) {
      await prisma.emailVerification.update({
        where: { email },
        data: { attempts: { increment: 1 } },
      });
      return res.status(400).json({ ok: false, error: "Incorrect code" });
    }

    // Достаём черновик
    const payload = (rec.payload ?? {}) as {
      username?: string;
      passwordHash?: string;
      avatarUrl?: string;
    };

    if (!payload.username || !payload.passwordHash) {
      return res
        .status(400)
        .json({ ok: false, error: "Draft is missing data" });
    }

    // Повторная проверка уникальности (на всякий случай)
    const [byEmail, byUsername] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.user.findUnique({ where: { username: payload.username! } }),
    ]);
    if (byEmail || byUsername) {
      return res.status(409).json({ ok: false, error: "User already exists" });
    }

    // Создаём пользователя (если аватар не прислали — ставим дефолт)
    const user = await prisma.user.create({
      data: {
        email,
        username: payload.username!,
        passwordHash: payload.passwordHash!,
        avatarUrl: payload.avatarUrl ?? DEFAULT_AVATAR_URL,
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        username: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    // Удаляем запись с кодом
    await prisma.emailVerification.delete({ where: { email } });

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

    return res.json({ ok: true, accessToken, user });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

/* =========================
   POST /api/auth/register
   (старый одношаговый, оставлен для совместимости)
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
      return res.status(400).json({
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
    } else {
      avatarUrl = DEFAULT_AVATAR_URL; // ← дефолт, если не загрузили
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
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse({
      email: normalizeEmail(req.body.email),
      password: normalizePassword(req.body.password),
    });
    if (!parsed.success) {
      return res.status(400).json({
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

/* =========================================================
   NEW: Forgot / Reset password
========================================================= */

/* =========================
   POST /api/auth/forgot
   JSON: { email }
   Ответ всегда одинаковый — не палим существование почты
========================= */
router.post("/forgot", forgotLimiter, async (req, res) => {
  try {
    const { email } = forgotSchema.parse({
      email: normalizeEmail(req.body.email),
    });

    // общий ответ
    const genericOk = {
      ok: true,
      message: "If this email exists, we've sent reset instructions.",
    };

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      // Не раскрываем, что почта не найдена
      return res.json(genericOk);
    }

    // Генерируем и сохраняем одноразовый токен (хэш)
    const token = generateResetToken();
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000);

    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        requestedIp:
          (req.headers["x-forwarded-for"] as string) ||
          req.socket.remoteAddress ||
          "",
        requestedUA: req.get("user-agent") || "",
      },
    });

    const resetUrl = `${FRONTEND_ORIGIN}/reset?token=${encodeURIComponent(
      token
    )}`;

    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (e) {
      // Не выдаём деталей наружу
    }

    return res.json(genericOk);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

/* =========================
   POST /api/auth/reset
   JSON: { token, newPassword }
   Меняет пароль, помечает токен использованным, отзывает все refresh
========================= */
router.post("/reset", resetLimiter, async (req, res) => {
  try {
    const { token, newPassword } = resetSchema.parse(req.body);
    const tokenHash = sha256(token);

    const record = await prisma.passwordReset.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    // единый ответ на любые фейлы
    const bad = () =>
      res.status(400).json({ ok: false, error: "Invalid or expired token." });

    if (!record) return bad();
    if (record.usedAt) return bad();
    if (record.expiresAt < new Date()) return bad();

    // Находим пользователя и проверяем, не совпадает ли пароль с текущим
    const user = await prisma.user.findUnique({
      where: { id: record.userId },
      select: { passwordHash: true },
    });

    if (!user) return bad();

    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);

    if (isSamePassword) {
      return res.status(400).json({
        ok: false,
        error: "Your new password must be different from the current password.",
      });
    }

    // Доп.проверка на утечки/слабость пароля
    const leaks = await pwnedCount(newPassword);
    if (leaks > 0) {
      return res.status(400).json({
        ok: false,
        error:
          "This password appears in known data breaches. Please choose a stronger one.",
        pwnedCount: leaks,
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction(async (tx) => {
      // 1) Сменить пароль пользователя
      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          // passwordVersion: { increment: 1 }, // если используешь версионирование
        },
      });

      // 2) Отозвать все активные refresh токены
      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 3) Пометить токен использованным
      await tx.passwordReset.update({
        where: { tokenHash },
        data: { usedAt: new Date() },
      });
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

export default router;
