// src/routes/auth.ts
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
  signEmailChangeProof,
  verifyEmailChangeProof,
} from "../lib/tokens.js";
import {
  sendVerificationCode,
  sendPasswordResetEmail,
  sendChangePasswordEmail, // ✅ NEW (если нет в mailer.ts — временно используй sendPasswordResetEmail)
} from "../lib/mailer.js";
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

// Change email schemas
const changeEmailProofSchema = z.object({
  password: z.string().min(6).max(200),
});

const changeEmailStartSchema = z.object({
  newEmail: z.string().email(),
  proof: z.string().min(20),
});

const changeEmailVerifySchema = z.object({
  newEmail: z.string().email(),
  code: z.string().min(6).max(6),
});

/* =========================================================
   NEW: Change email (password -> new email -> verify code)
========================================================= */

/* =========================
   POST /api/auth/change-email/proof
   JSON: { password }
   -> { ok, proof }
========================= */
router.post(
  "/change-email/proof",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      if (!req.userId)
        return res.status(401).json({ ok: false, error: "Unauthorized" });

      const parsed = changeEmailProofSchema.safeParse({
        password: normalizePassword(req.body?.password),
      });

      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, passwordHash: true },
      });

      if (!user)
        return res.status(404).json({ ok: false, error: "User not found" });

      const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ ok: false, error: "Invalid password" });
      }

      const proof = signEmailChangeProof(user.id);
      return res.json({ ok: true, proof });
    } catch (e) {
      console.error(e);
      return res
        .status(500)
        .json({ ok: false, error: "Internal server error" });
    }
  }
);

/* =========================
   POST /api/auth/change-email/start
   JSON: { newEmail, proof }
   -> sends code to newEmail
========================= */
router.post(
  "/change-email/start",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      if (!req.userId)
        return res.status(401).json({ ok: false, error: "Unauthorized" });

      const parsed = changeEmailStartSchema.safeParse({
        newEmail: normalizeEmail(req.body?.newEmail),
        proof: (req.body?.proof ?? "").toString(),
      });

      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      // verify proof
      let decoded: { sub: string };
      try {
        const p = verifyEmailChangeProof(parsed.data.proof);
        decoded = { sub: p.sub };
      } catch (e) {
        return res.status(401).json({ ok: false, error: "Invalid proof token" });
      }

      if (decoded.sub !== req.userId) {
        return res.status(401).json({ ok: false, error: "Invalid proof token" });
      }

      // newEmail must be free
      const existing = await prisma.user.findUnique({
        where: { email: parsed.data.newEmail },
        select: { id: true },
      });
      if (existing) {
        return res.status(409).json({ ok: false, error: "Email already in use" });
      }

      // generate code
      const code = random6();
      const codeHash = sha256hex(code);
      const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MIN * 60 * 1000);

      // store record for new email
      await prisma.emailVerification.upsert({
        where: { email: parsed.data.newEmail },
        create: {
          email: parsed.data.newEmail,
          codeHash,
          expiresAt,
          attempts: 0,
          maxAttempts: EMAIL_MAX_ATTEMPTS,
          payload: {
            kind: "changeEmail",
            userId: req.userId,
          },
        },
        update: {
          codeHash,
          expiresAt,
          attempts: 0,
          maxAttempts: EMAIL_MAX_ATTEMPTS,
          payload: {
            kind: "changeEmail",
            userId: req.userId,
          },
        },
      });

      try {
        await sendVerificationCode(parsed.data.newEmail, code, "change-email");
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
   POST /api/auth/change-email/verify
   JSON: { newEmail, code }
   -> updates user.email
========================= */
router.post(
  "/change-email/verify",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      if (!req.userId)
        return res.status(401).json({ ok: false, error: "Unauthorized" });

      const parsed = changeEmailVerifySchema.safeParse({
        newEmail: normalizeEmail(req.body?.newEmail),
        code: (req.body?.code ?? "").toString().trim(),
      });

      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      const rec = await prisma.emailVerification.findUnique({
        where: { email: parsed.data.newEmail },
      });

      if (!rec) return res.status(400).json({ ok: false, error: "Code not found" });

      const now = new Date();
      if (rec.expiresAt < now) {
        return res.status(400).json({ ok: false, error: "Code expired" });
      }
      if (rec.attempts >= rec.maxAttempts) {
        return res.status(429).json({ ok: false, error: "Too many attempts" });
      }

      // check payload
      const payload = (rec.payload ?? {}) as { kind?: string; userId?: string };
      if (payload.kind !== "changeEmail" || !payload.userId) {
        return res
          .status(400)
          .json({ ok: false, error: "Invalid verification record" });
      }

      if (payload.userId !== req.userId) {
        return res.status(403).json({ ok: false, error: "Forbidden" });
      }

      const ok = rec.codeHash === sha256hex(parsed.data.code);
      if (!ok) {
        await prisma.emailVerification.update({
          where: { email: parsed.data.newEmail },
          data: { attempts: { increment: 1 } },
        });
        return res.status(400).json({ ok: false, error: "Incorrect code" });
      }

      // newEmail must still be free (race condition)
      const taken = await prisma.user.findUnique({
        where: { email: parsed.data.newEmail },
        select: { id: true },
      });
      if (taken) {
        return res.status(409).json({ ok: false, error: "Email already in use" });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.user.update({
          where: { id: req.userId! },
          data: {
            email: parsed.data.newEmail,
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

        await tx.emailVerification.delete({
          where: { email: parsed.data.newEmail },
        });

        return u;
      });

      return res.json({ ok: true, user: updated });
    } catch (e) {
      console.error(e);
      return res
        .status(500)
        .json({ ok: false, error: "Internal server error" });
    }
  }
);

/* =========================================================
   NEW: Change password link for AUTHED user (Settings)
   POST /api/auth/change-password/request
========================================================= */
router.post(
  "/change-password/request",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      if (!req.userId)
        return res.status(401).json({ ok: false, error: "Unauthorized" });

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, email: true },
      });

      if (!user) {
        return res.status(404).json({ ok: false, error: "User not found" });
      }

      // (опционально) можно ревокнуть старые неиспользованные токены
      // чтобы всегда работала только последняя ссылка:
      // await prisma.passwordReset.updateMany({
      //   where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      //   data: { usedAt: new Date() },
      // });

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
        // ✅ красивое письмо "Change password"
        await sendChangePasswordEmail(user.email, resetUrl);

        // ⚠️ если нет sendChangePasswordEmail в mailer.ts,
        // временно используй:
        // await sendPasswordResetEmail(user.email, resetUrl);
      } catch (e: any) {
        console.error("[sendChangePasswordEmail] error:", e?.message || e);
        return res.status(500).json({
          ok: false,
          error:
            "Email sending failed (SMTP). Check SMTP_* in .env or reset Mailtrap credentials.",
        });
      }

      return res.json({ ok: true, message: "Password change link sent" });
    } catch (e) {
      console.error(e);
      return res
        .status(500)
        .json({ ok: false, error: "Internal server error" });
    }
  }
);

/* =========================================================
  Two-step registration with email code
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
        return res.status(409).json({ ok: false, error: "Email already in use" });
      if (byUsername)
        return res.status(409).json({ ok: false, error: "Username already in use" });

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
        await sendVerificationCode(parsed.data.email, code, "register");
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
      return res.status(500).json({ ok: false, error: "Internal server error" });
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
    if (!rec) return res.status(400).json({ ok: false, error: "Code not found" });

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

    await prisma.emailVerification.delete({ where: { email } });

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
      return res.status(409).json({ ok: false, error: "Username already in use" });

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

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockUntil: null },
    });

    const accessToken = signAccess(user.id);

    const refreshRaw = newRefreshRaw();
    const refreshHash = sha256(refreshRaw);

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
   Forgot / Reset password
========================================================= */

/* =========================
   POST /api/auth/forgot
========================= */
router.post("/forgot", forgotLimiter, async (req, res) => {
  try {
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
      // do not reveal details
    }

    return res.json(genericOk);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

/* =========================
   POST /api/auth/reset
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
      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
        },
      });

      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

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
        return res
          .status(400)
          .json({ ok: false, message: "Avatar is required" });
      }

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

      const old = user?.avatarUrl || "";
      const isOldLocal =
        typeof old === "string" &&
        old.startsWith("/uploads/") &&
        !old.includes("/uploads/defaults/") &&
        !old.endsWith("/uploads/_noavatar.png");

      if (isOldLocal) {
        const oldPath = path.join(
          process.cwd(),
          old.replace("/uploads/", "uploads/")
        );
        fs.promises.unlink(oldPath).catch(() => {});
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
// =========================
router.patch("/nickname", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const nicknameRaw = String(req.body?.nickname ?? "");
    const nickname = nicknameRaw.trim();

    if (!nickname) {
      return res
        .status(400)
        .json({ ok: false, message: "Nickname is required." });
    }

    if (nickname.length < 2 || nickname.length > 40) {
      return res.status(400).json({
        ok: false,
        message: "Nickname must be between 2 and 40 characters.",
      });
    }

    const slugify = (s: string) => {
      return s
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9_-]/g, "")
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

    let candidate = base;
    const existingSame = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { username: true },
    });

    if (!existingSame) {
      return res.status(404).json({ ok: false, message: "User not found." });
    }

    if (candidate !== existingSame.username) {
      for (let i = 0; i < 50; i++) {
        const taken = await prisma.user.findUnique({
          where: { username: candidate },
          select: { id: true },
        });

        if (!taken || taken.id === req.userId) break;
        candidate = `${base}-${i + 2}`;
      }

      const takenFinal = await prisma.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });

      if (takenFinal && takenFinal.id !== req.userId) {
        return res.status(409).json({
          ok: false,
          message: "Username is taken. Try another nickname.",
        });
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
