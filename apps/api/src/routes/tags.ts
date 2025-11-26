// apps/api/src/routes/tags.ts
import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

/**
 * GET /api/tags/search?q=hip
 * Возвращает до 10 хэштегов, начинающихся с префикса q
 * tag хранится без # и в нижнем регистре, например "hiphop"
 */
router.get("/search", async (req, res) => {
  const q =
    typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

  if (!q) {
    return res.json({ ok: true, hashtags: [] });
  }

  try {
    const hashtags = await prisma.hashtag.findMany({
      where: {
        tag: {
          startsWith: q,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });

    return res.json({
      ok: true,
      hashtags: hashtags.map((h) => ({
        id: h.id,
        tag: h.tag,
      })),
    });
  } catch (err) {
    console.error("Hashtag search error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Не удалось загрузить хэштеги" });
  }
});

export default router;
