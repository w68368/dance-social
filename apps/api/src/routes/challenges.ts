import { Router } from "express";
import { z } from "zod";
import path from "path";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth.js";
import { upload } from "../lib/upload.js";
import { cloudinary } from "../lib/cloudinary.js";

const router = Router();

/* =========================
   Helpers
========================= */
function clampTake(v: any, def = 12) {
  const n = Number(v ?? def);
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.min(50, n));
}

const createChallengeSchema = z.object({
  title: z.string().min(3).max(80),
  description: z.string().min(10).max(1500),
  style: z.string().min(2).max(50),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "PRO"]),
  durationDays: z.number().int().min(1).max(365),
});

/* =========================
   Public list endpoints
========================= */

// GET /api/challenges/new?take=12
router.get("/new", async (req, res) => {
  const take = clampTake(req.query.take, 12);

  const items = await prisma.challenge.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      creator: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
      _count: { select: { participants: true, submissions: true } },
    },
  });

  res.json({ items });
});

// GET /api/challenges/trending?take=12
router.get("/trending", async (req, res) => {
  const take = clampTake(req.query.take, 12);

  const items = await prisma.challenge.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ participants: { _count: "desc" } }, { createdAt: "desc" }],
    take,
    include: {
      creator: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
      _count: { select: { participants: true, submissions: true } },
    },
  });

  res.json({ items });
});

/* =========================
   Auth required
========================= */

// GET /api/challenges/mine/accepted
router.get("/mine/accepted", requireAuth, async (req: AuthedRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

  const take = clampTake(req.query.take, 24);

  const rows = await prisma.challengeParticipant.findMany({
    where: { userId: req.userId },
    orderBy: { acceptedAt: "desc" },
    take,
    include: {
      challenge: {
        include: {
          creator: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          _count: { select: { participants: true, submissions: true } },
        },
      },
    },
  });

  res.json({ items: rows.map((r) => r.challenge) });
});

// GET /api/challenges/mine/created
router.get("/mine/created", requireAuth, async (req: AuthedRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

  const take = clampTake(req.query.take, 24);

  const items = await prisma.challenge.findMany({
    where: { creatorId: req.userId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      creator: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
      _count: { select: { participants: true, submissions: true } },
    },
  });

  res.json({ items });
});

// POST /api/challenges (multipart: fields + optional file "example")
router.post(
  "/",
  requireAuth,
  upload.single("example"),
  async (req: AuthedRequest & { file?: Express.Multer.File }, res) => {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = createChallengeSchema.safeParse({
      title: req.body.title,
      description: req.body.description,
      style: req.body.style,
      level: req.body.level,
      durationDays: Number(req.body.durationDays),
    });

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid data",
        details: parsed.error.flatten(),
      });
    }

    const { title, description, style, level, durationDays } = parsed.data;

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

    let exampleVideoUrl: string | null = null;
    let exampleVideoType: string | null = null;
    let exampleLocalPath: string | null = null;

    try {
      const file = req.file;

      if (file) {
        const isVideo = file.mimetype.startsWith("video/");
        if (!isVideo) {
          return res.status(400).json({ error: "Only video files are allowed for example." });
        }

        const uploadResult = await cloudinary.uploader.upload(file.path, {
          resource_type: "video",
          folder: process.env.CLOUDINARY_UPLOAD_FOLDER || "stepunity/challenges",
        });

        exampleVideoUrl = uploadResult.secure_url;
        exampleVideoType = file.mimetype;
        exampleLocalPath = path.relative(process.cwd(), file.path);
      }

      const challenge = await prisma.challenge.create({
        data: {
          title,
          description,
          style,
          level,
          startsAt,
          endsAt,
          status: "ACTIVE",
          exampleVideoUrl: exampleVideoUrl ?? undefined,
          exampleVideoType: exampleVideoType ?? undefined,
          // если в Prisma нет поля exampleLocalPath — убери следующую строку
          // exampleLocalPath: exampleLocalPath ?? undefined,
          creatorId: req.userId,
        },
        include: {
          creator: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          _count: { select: { participants: true, submissions: true } },
        },
      });

      res.json({ challenge });
    } catch (e: any) {
      console.error(e);
      return res.status(500).json({ error: "Failed to create challenge" });
    }
  }
);

// POST /api/challenges/:id/accept
router.post("/:id/accept", requireAuth, async (req: AuthedRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

  const id = req.params.id;

  const ch = await prisma.challenge.findUnique({ where: { id } });
  if (!ch) return res.status(404).json({ error: "Challenge not found" });
  if (ch.status !== "ACTIVE") return res.status(400).json({ error: "Challenge is not active" });

  const row = await prisma.challengeParticipant.upsert({
    where: { challengeId_userId: { challengeId: id, userId: req.userId } },
    create: { challengeId: id, userId: req.userId },
    update: {},
  });

  res.json({ ok: true, acceptedAt: row.acceptedAt });
});

// DELETE /api/challenges/:id/accept  -> leave / cancel participation
router.delete("/:id/accept", requireAuth, async (req: AuthedRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

  const id = req.params.id;

  const ch = await prisma.challenge.findUnique({ where: { id } });
  if (!ch) return res.status(404).json({ error: "Challenge not found" });

  await prisma.$transaction([
    // удаляем видео-сабмиты этого юзера по этому челленджу
    prisma.challengeSubmission.deleteMany({
      where: { challengeId: id, userId: req.userId },
    }),
    // удаляем участие
    prisma.challengeParticipant.deleteMany({
      where: { challengeId: id, userId: req.userId },
    }),
  ]);

  res.json({ ok: true });
});


// POST /api/challenges/:id/submissions (multipart: file "video", optional caption)
router.post(
  "/:id/submissions",
  requireAuth,
  upload.single("video"),
  async (req: AuthedRequest & { file?: Express.Multer.File }, res) => {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

    const id = req.params.id;

    const ch = await prisma.challenge.findUnique({ where: { id } });
    if (!ch) return res.status(404).json({ error: "Challenge not found" });
    if (ch.status !== "ACTIVE") return res.status(400).json({ error: "Challenge is not active" });

    const accepted = await prisma.challengeParticipant.findUnique({
      where: { challengeId_userId: { challengeId: id, userId: req.userId } },
    });
    if (!accepted) return res.status(403).json({ error: "You must accept this challenge first" });

    const file = req.file;
    if (!file) return res.status(400).json({ error: "Video is required" });
    if (!file.mimetype.startsWith("video/")) {
      return res.status(400).json({ error: "Only video files are supported" });
    }

    const caption = typeof req.body.caption === "string" ? req.body.caption.slice(0, 500) : null;

    try {
      const uploadResult = await cloudinary.uploader.upload(file.path, {
        resource_type: "video",
        folder: process.env.CLOUDINARY_UPLOAD_FOLDER || "stepunity/challenge-submissions",
      });

      const sub = await prisma.challengeSubmission.create({
        data: {
          challengeId: id,
          userId: req.userId,
          videoUrl: uploadResult.secure_url,
          videoType: file.mimetype,
          caption: caption ?? undefined,
        },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      });

      res.json({ submission: sub });
    } catch (e: any) {
      console.error(e);
      return res.status(500).json({ error: "Failed to upload submission" });
    }
  }
);

// GET /api/challenges/:id/submissions?take=20
router.get("/:id/submissions", async (req, res) => {
  const id = req.params.id;
  const take = clampTake(req.query.take, 20);

  const items = await prisma.challengeSubmission.findMany({
    where: { challengeId: id },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });

  res.json({ items });
});

// DELETE /api/challenges/:id (author only)
router.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId;
  const id = req.params.id;

  if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized" });

  try {
    const ch = await prisma.challenge.findUnique({
      where: { id },
      select: { id: true, creatorId: true },
    });

    if (!ch) return res.status(404).json({ ok: false, error: "Challenge not found" });
    if (ch.creatorId !== userId) {
      return res.status(403).json({ ok: false, error: "You can delete only your own challenges" });
    }

    // If you have relations — delete children first (safe)
    await prisma.$transaction([
      prisma.challengeSubmission.deleteMany({ where: { challengeId: id } }),
      prisma.challengeParticipant.deleteMany({ where: { challengeId: id } }),
      prisma.challenge.delete({ where: { id } }),
    ]);

    return res.json({ ok: true, deletedId: id });
  } catch (err) {
    console.error("Delete challenge error:", err);
    return res.status(500).json({ ok: false, error: "Failed to delete challenge" });
  }
});


router.post("/:id/winner", requireAuth, async (req: AuthedRequest, res) => {
  const challengeId = req.params.id;
  const userId = req.userId!;
  const { winnerUserId } = req.body as { winnerUserId?: string };

  if (!winnerUserId) return res.status(400).json({ error: "winnerUserId is required" });

  const ch = await prisma.challenge.findUnique({ where: { id: challengeId } });
  if (!ch) return res.status(404).json({ error: "Challenge not found" });

  if (ch.creatorId !== userId) return res.status(403).json({ error: "Only creator can set winner" });

  // winner must be a participant (or have submission)
  const isParticipant = await prisma.challengeParticipant.findFirst({
    where: { challengeId, userId: winnerUserId },
    select: { id: true },
  });

  if (!isParticipant) {
    return res.status(400).json({ error: "Winner must be a participant of this challenge" });
  }

  const updated = await prisma.challenge.update({
    where: { id: challengeId },
    data: { winnerId: winnerUserId },
    include: {
      winner: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });

  res.json({ ok: true, challenge: updated });
});


export default router;
