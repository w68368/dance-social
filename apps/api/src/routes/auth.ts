import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { upload } from "../lib/upload.js";
import bcrypt from "bcrypt";
import { z } from "zod";
import { signToken, requireAuth, AuthedRequest } from "../lib/auth.js";

const router = Router();

/* =========================
   CONST & HELPERS
========================= */
const MAX_ATTEMPTS = 4;
const LOCK_MINUTES = 5;

function normalizeEmail(v: string) {
  return (v ?? "").trim().toLowerCase();
}
function normalizeUsername(v: string) {
  return (v ?? "").trim();
}
function normalizePassword(v: string) {
  return (v ?? "").trim();
}

/* =========================
   SCHEMAS
========================= */

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(24),
  password: z.string().min(6).max(200),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
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
      gender: req.body.gender,
    };

    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const [byEmail, byUsername] = await Promise.all([
      prisma.user.findUnique({ where: { email: parsed.data.email } }),
      prisma.user.findUnique({ where: { username: parsed.data.username } }),
    ]);
    if (byEmail) return res.status(409).json({ error: "Email already in use" });
    if (byUsername)
      return res.status(409).json({ error: "Username already in use" });

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    let avatarUrl: string | undefined;
    if (req.file) {
      avatarUrl = "/uploads/" + req.file.filename; // Раздаётся как статика
    }

    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        username: parsed.data.username,
        passwordHash,
        gender: parsed.data.gender,
        avatarUrl,
        // счётчики по умолчанию — Prisma сам поставит default
      },
      select: {
        id: true,
        email: true,
        username: true,
        gender: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    return res.status(201).json({ ok: true, user });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* =========================
   POST /api/auth/login
   JSON: { email, password }
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
        .json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const now = new Date();

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: {
        id: true,
        email: true,
        username: true,
        gender: true,
        avatarUrl: true,
        createdAt: true,
        passwordHash: true,
        failedLoginAttempts: true,
        lockUntil: true,
      },
    });

    // Унифицированный фолбэк, чтобы не раскрывать существование email
    const genericFail = (extra?: Record<string, unknown>) =>
      res.status(401).json({ error: "Invalid email or password", ...extra });

    if (!user) return genericFail();

    // Если пользователь залочен — сообщаем, сколько осталось ждать
    if (user.lockUntil && user.lockUntil > now) {
      const lockRemainingMs = user.lockUntil.getTime() - now.getTime();
      return res.status(429).json({
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

      // Достигли лимита — включаем блокировку
      if (newCount >= MAX_ATTEMPTS) {
        const unlockAt = new Date(now.getTime() + LOCK_MINUTES * 60 * 1000);
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0, // сброс
            lockUntil: unlockAt,
          },
        });
        return res.status(429).json({
          error: "Too many failed attempts. Account locked for a short period.",
          unlockAt: unlockAt.toISOString(),
          lockRemainingMs: LOCK_MINUTES * 60 * 1000,
          attemptsLeft: 0,
        });
      }

      // Иначе увеличиваем счётчик и говорим, сколько осталось
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: newCount },
      });
      return genericFail({ attemptsLeft: MAX_ATTEMPTS - newCount });
    }

    // Успешный логин — сбрасываем счётчики
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockUntil: null },
    });

    const token = signToken(user.id);

    return res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        gender: user.gender,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* =========================
   GET /api/auth/me
   Требует заголовок: Authorization: Bearer <token>
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
        gender: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ ok: true, user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
