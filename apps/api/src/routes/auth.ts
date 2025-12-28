import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";
import { pwnedCount } from "../lib/pwned.js";
import fs from "fs";
import path from "path";

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
import { verifyRecaptcha } from "../lib/recaptcha.js";

const router = Router();

/* =========================
   CONST & HELPERS
========================= */
const MAX_ATTEMPTS = 4;
const LOCK_MINUTES = 5;
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_DAYS ?? 30);
const SHORT_REFRESH_TTL_DAYS = Number(
  process.env.REFRESH_TOKEN_DAYS_SHORT ?? 2
);

// For email confirmation
const EMAIL_CODE_TTL_MIN = Number(process.env.EMAIL_CODE_TTL_MIN ?? 10);
const EMAIL_MAX_ATTEMPTS = Number(process.env.EMAIL_MAX_ATTEMPTS ?? 5);

// To reset the password
const RESET_TOKEN_TTL_MIN = Number(process.env.RESET_TOKEN_TTL_MIN ?? 30);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

// Default avatar (apps/api/uploads/defaults/default-avatar.png)
const DEFAULT_AVATAR_URL = "/uploads/defaults/default-avatar.png";

const normalizeEmail = (v: string) => (v ?? "").trim().toLowerCase();
const normalizeUsername = (v: string) => (v ?? "").trim();

// Creating a technical username service:
// - trim spaces at the edges
// - convert to lowercase
// - remove spaces inside
// - leave only Latin letters, numbers, and _
const makeUsernameSlug = (v: string) =>
  normalizeUsername(v)
    .toLowerCase()
    .replace(/\s+/g, "") // remove all spaces
    .replace(/[^a-z0-9_]/g, ""); // throw away all unnecessary things

const normalizePassword = (v: string) => (v ?? "").trim();

const addDays = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

const random6 = () => Math.floor(100000 + Math.random() * 900000).toString();

const sha256hex = (s: string) =>
  crypto.createHash("sha256").update(s).digest("hex");

// single response if login fails - we don't reveal whether the email exists
const loginFail = (res: any, extra?: Record<string, unknown>) =>
  res
    .status(401)
    .json({ ok: false, message: "Invalid email or password", ...extra });

/* =========================
   Zod schematics (gender-free)
========================= */
const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(24),
  password: z.string().min(6).max(200),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
  rememberMe: z.boolean().optional().default(true),
});

// Forgot/Reset schemes
const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(8).max(128),
});

/* ============================================================
  NEW: Two-step registration with email code
  1) /register-start — sends the code and uploads a draft
  2) /register-verify — verifies the code, creates a user, and logs in
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
      // reCAPTCHA v2
      const captchaToken = req.body.captchaToken as string | undefined;
      const captcha = await verifyRecaptcha(
        captchaToken,
        (req.headers["x-forwarded-for"] as string) ?? req.ip
      );

      if (!captcha.ok) {
        return res.status(400).json({
          ok: false,
          error: "captcha_failed",
        });
      }

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

      // displayName — as entered by the user
      const rawUsername = normalizeUsername(parsed.data.username);
      // slug for database and @mentions
      const usernameSlug = makeUsernameSlug(rawUsername);

      if (!usernameSlug || usernameSlug.length < 3) {
        return res.status(400).json({
          ok: false,
          error: "Invalid username",
        });
      }

      // Uniqueness
      const [byEmail, byUsername] = await Promise.all([
        prisma.user.findUnique({ where: { email: parsed.data.email } }),
        prisma.user.findUnique({ where: { username: usernameSlug } }),
      ]);
      if (byEmail)
        return res
          .status(409)
          .json({ ok: false, error: "Email already in use" });
      if (byUsername)
        return res
          .status(409)
          .json({ ok: false, error: "Username already in use" });

      // Password Leak Check (HIBP)
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

      // If you sent an avatar, save the URL (the file is already placed by multer in /uploads)
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
            usernameSlug,
            displayName: rawUsername,
            passwordHash,
            avatarUrl,
          },
        },
        update: {
          codeHash,
          expiresAt,
          attempts: 0,
          maxAttempts: EMAIL_MAX_ATTEMPTS,
          payload: {
            usernameSlug,
            displayName: rawUsername,
            passwordHash,
            avatarUrl,
          },
        },
      });

      // We send an email with a code (we provide a clear message in case of SMTP error)
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

    const payload = (rec.payload ?? {}) as {
      usernameSlug?: string;
      displayName?: string;
      passwordHash?: string;
      avatarUrl?: string;
    };

    if (!payload.usernameSlug || !payload.passwordHash) {
      return res
        .status(400)
        .json({ ok: false, error: "Draft is missing data" });
    }

    // Re-check for uniqueness (just in case)
    const [byEmail, byUsername] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.user.findUnique({ where: { username: payload.usernameSlug! } }),
    ]);
    if (byEmail || byUsername) {
      return res.status(409).json({ ok: false, error: "User already exists" });
    }

    // Create a user
    const user = await prisma.user.create({
      data: {
        email,
        username: payload.usernameSlug!,
        displayName: payload.displayName ?? payload.usernameSlug!,
        passwordHash: payload.passwordHash!,
        avatarUrl: payload.avatarUrl ?? DEFAULT_AVATAR_URL,
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    // Delete the entry with the code
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

    // set the HttpOnly cookie
    res.cookie("refresh", refreshRaw, refreshCookieOptions());

    return res.json({ ok: true, accessToken, user });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

/* =========================
   POST /api/auth/register
   multipart/form-data (avatar)
========================= */
router.post("/register", upload.single("avatar"), async (req, res) => {
  try {
    // reCAPTCHA v2
    const captchaToken = req.body.captchaToken as string | undefined;
    const captcha = await verifyRecaptcha(
      captchaToken,
      (req.headers["x-forwarded-for"] as string) ?? req.ip
    );

    if (!captcha.ok) {
      return res.status(400).json({
        ok: false,
        error: "captcha_failed",
      });
    }

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

    const rawUsername = normalizeUsername(parsed.data.username);
    const usernameSlug = makeUsernameSlug(rawUsername);

    if (!usernameSlug || usernameSlug.length < 3) {
      return res.status(400).json({
        ok: false,
        error: "Invalid username",
      });
    }

    const [byEmail, byUsername] = await Promise.all([
      prisma.user.findUnique({ where: { email: parsed.data.email } }),
      prisma.user.findUnique({ where: { username: usernameSlug } }),
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
      avatarUrl = "/uploads/" + req.file.filename;
    } else {
      avatarUrl = DEFAULT_AVATAR_URL;
    }

    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        username: usernameSlug,
        displayName: rawUsername,
        passwordHash,
        avatarUrl,
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
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
   JSON: { email, password, rememberMe }
   -> set-cookie: refresh=... (HttpOnly) + { accessToken, user }
========================= */
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse({
      email: normalizeEmail(req.body.email),
      password: normalizePassword(req.body.password),
      rememberMe: req.body.rememberMe,
    });

    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    const { email, password, rememberMe } = parsed.data;

    const now = new Date();
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        createdAt: true,
        passwordHash: true,
        failedLoginAttempts: true,
        lockUntil: true,
      },
    });

    if (!user) return loginFail(res);

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

    const ok = await bcrypt.compare(password, user.passwordHash);
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

    // Success - reset counters
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockUntil: null },
    });

    // === Access + Refresh ===
    const accessToken = signAccess(user.id);

    const refreshRaw = newRefreshRaw();
    const refreshHash = sha256(refreshRaw);

    // Selecting a TTL for a refresh token
    const ttlDays = rememberMe ? REFRESH_TTL_DAYS : SHORT_REFRESH_TTL_DAYS;

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshHash,
        expiresAt: addDays(new Date(), ttlDays),
        ip:
          (req.headers["x-forwarded-for"] as string) ||
          req.socket.remoteAddress ||
          "",
        userAgent: req.get("user-agent") || "",
      },
    });

    // set the HttpOnly cookie
    res.cookie("refresh", refreshRaw, refreshCookieOptions(ttlDays));

    return res.json({
      ok: true,
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
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
        displayName: true,
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
========================= */
router.post("/forgot", forgotLimiter, async (req, res) => {
  try {
    // reCAPTCHA v2
    const captchaToken = req.body.captchaToken as string | undefined;
    const captcha = await verifyRecaptcha(
      captchaToken,
      (req.headers["x-forwarded-for"] as string) ?? req.ip
    );

    if (!captcha.ok) {
      return res.status(400).json({
        ok: false,
        error: "captcha_failed",
      });
    }

    const { email } = forgotSchema.parse({
      email: normalizeEmail(req.body.email),
    });

    const genericOk = {
      ok: true,
      message: "If this email exists, we've sent reset instructions.",
    };

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      return res.json(genericOk);
    }

    // Generate and store a one-time token (hash)
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
      // We don't reveal any details.
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
   Changes the password, marks the token as used, revokes all refreshes
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

    const bad = () =>
      res.status(400).json({ ok: false, error: "Invalid or expired token." });

    if (!record) return bad();
    if (record.usedAt) return bad();
    if (record.expiresAt < new Date()) return bad();

    // Find the user and check if the password matches the current one
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

    // Additional check for password leaks/weaknesses
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
      // 1) Change the user's password
      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
        },
      });

      // 2) Revoke all active refresh tokens
      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 3) Mark the token as used
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

// =========================
// PATCH /api/auth/avatar
// multipart/form-data: avatar (image)
// =========================
router.patch(
  "/avatar",
  requireAuth,
  upload.single("avatar"),
  async (req: AuthedRequest & { file?: Express.Multer.File }, res) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ ok: false, message: "Unauthorized" });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ ok: false, message: "Avatar is required" });
      }

      // only images
      if (!file.mimetype.startsWith("image/")) {
        return res.status(400).json({
          ok: false,
          message: "Only image files are allowed for avatar",
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { avatarUrl: true },
      });

      const newAvatarUrl = "/uploads/" + file.filename;

      // delete old avatar file (only if it was a local uploaded file)
      const old = user?.avatarUrl || "";
      const isOldLocal =
        typeof old === "string" &&
        old.startsWith("/uploads/") &&
        !old.includes("/uploads/defaults/") &&
        !old.endsWith("/uploads/_noavatar.png");

      if (isOldLocal) {
        const oldPath = path.join(process.cwd(), old.replace("/uploads/", "uploads/"));
        fs.promises.unlink(oldPath).catch(() => {
          // ignore if file doesn't exist
        });
      }

      const updated = await prisma.user.update({
        where: { id: req.userId },
        data: { avatarUrl: newAvatarUrl },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          createdAt: true,
        },
      });

      return res.json({ ok: true, user: updated });
    } catch (err: any) {
      console.error("Update avatar error:", err);
      return res.status(500).json({
        ok: false,
        message: err?.message || "Server error",
      });
    }
  }
);


// =========================
// PATCH /api/auth/nickname
// body: { nickname: string }
// updates displayName + generates username slug
// =========================
router.patch("/nickname", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const nicknameRaw = String(req.body?.nickname ?? "");
    const nickname = nicknameRaw.trim();

    if (!nickname) {
      return res.status(400).json({ ok: false, message: "Nickname is required." });
    }

    if (nickname.length < 2 || nickname.length > 40) {
      return res.status(400).json({
        ok: false,
        message: "Nickname must be between 2 and 40 characters.",
      });
    }

    // slugify -> username
    const slugify = (s: string) => {
      return s
        .trim()
        .toLowerCase()
        // replace polish chars etc. (basic)
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        // spaces -> dash
        .replace(/\s+/g, "-")
        // keep a-z 0-9 dash underscore
        .replace(/[^a-z0-9_-]/g, "")
        // collapse dashes
        .replace(/-+/g, "-")
        .replace(/^[-_]+|[-_]+$/g, "");
    };

    const base = slugify(nickname);

    if (!base || base.length < 3) {
      return res.status(400).json({
        ok: false,
        message:
          "Nickname is too short or contains unsupported characters. Try using letters/numbers.",
      });
    }

    // Ensure unique username:
    // if taken -> add -2, -3 ... (up to 50)
    let candidate = base;
    const existingSame = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { username: true },
    });

    if (!existingSame) {
      return res.status(404).json({ ok: false, message: "User not found." });
    }

    // If user keeps same nickname producing same username, it's fine
    if (candidate !== existingSame.username) {
      for (let i = 0; i < 50; i++) {
        const taken = await prisma.user.findUnique({
          where: { username: candidate },
          select: { id: true },
        });

        if (!taken || taken.id === req.userId) break;
        candidate = `${base}-${i + 2}`;
      }

      // final check
      const takenFinal = await prisma.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });

      if (takenFinal && takenFinal.id !== req.userId) {
        return res
          .status(409)
          .json({ ok: false, message: "Username is taken. Try another nickname." });
      }
    }

    const updated = await prisma.user.update({
      where: { id: req.userId },
      data: {
        displayName: nickname,
        username: candidate,
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    return res.json({ ok: true, user: updated });
  } catch (err: any) {
    console.error("Update nickname error:", err);
    return res.status(500).json({
      ok: false,
      message: err?.message || "Server error",
    });
  }
});



export default router;
