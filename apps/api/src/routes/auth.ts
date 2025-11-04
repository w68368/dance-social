import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { upload } from "../lib/upload.js";
import bcrypt from "bcrypt";
import { z } from "zod";
import { signToken, requireAuth, AuthedRequest } from "../lib/auth.js";

const router = Router();

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
      email: req.body.email,
      username: req.body.username,
      password: req.body.password,
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
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });
    if (!user)
      return res.status(401).json({ error: "Invalid email or password" });

    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok)
      return res.status(401).json({ error: "Invalid email or password" });

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
});

export default router;
