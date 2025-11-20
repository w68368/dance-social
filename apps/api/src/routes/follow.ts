// apps/api/src/routes/follow.ts
import { Router, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth.js";

const router = Router();

// ---------- ПОДПИСАТЬСЯ ----------
router.post(
  "/:targetId",
  requireAuth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const targetId = req.params.targetId;
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ ok: false, message: "Unauthorized" });
      }

      if (targetId === userId) {
        return res
          .status(400)
          .json({ ok: false, message: "Нельзя подписаться на себя" });
      }

      await prisma.follow.upsert({
        where: {
          // имя композитного ключа из @@unique([followerId, followingId])
          followerId_followingId: {
            followerId: userId,
            followingId: targetId,
          },
        },
        update: {},
        create: {
          followerId: userId,
          followingId: targetId,
        },
      });

      return res.json({ ok: true, action: "followed" });
    } catch (err) {
      console.error("Follow error", err);
      return res.status(500).json({ ok: false, message: "Ошибка подписки" });
    }
  }
);

// ---------- ОТПИСАТЬСЯ ----------
router.delete(
  "/:targetId",
  requireAuth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const targetId = req.params.targetId;
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ ok: false, message: "Unauthorized" });
      }

      await prisma.follow.deleteMany({
        where: {
          followerId: userId,
          followingId: targetId,
        },
      });

      return res.json({ ok: true, action: "unfollowed" });
    } catch (err) {
      console.error("Unfollow error", err);
      return res.status(500).json({ ok: false, message: "Ошибка отписки" });
    }
  }
);

// ---------- СТАТИСТИКА + СТАТУС ----------
router.get(
  "/stats/:userId",
  requireAuth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const targetId = req.params.userId;
      const currentUserId = req.userId;

      if (!currentUserId) {
        return res.status(401).json({ ok: false, message: "Unauthorized" });
      }

      const [followers, following, relation] = await Promise.all([
        prisma.follow.count({ where: { followingId: targetId } }),
        prisma.follow.count({ where: { followerId: targetId } }),
        prisma.follow.findFirst({
          where: { followerId: currentUserId, followingId: targetId },
        }),
      ]);

      return res.json({
        ok: true,
        followers,
        following,
        isFollowing: Boolean(relation),
      });
    } catch (err) {
      console.error("Follow stats error", err);
      return res
        .status(500)
        .json({ ok: false, message: "Ошибка загрузки статистики" });
    }
  }
);

// ---------- СПИСОК ФОЛЛОВЕРОВ ----------
router.get(
  "/followers/:userId",
  requireAuth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const targetId = req.params.userId;

      const follows = await prisma.follow.findMany({
        where: { followingId: targetId },
        include: {
          follower: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const users = follows.map((f) => ({
        id: f.follower.id,
        username: f.follower.username, // slug для @
        displayName: f.follower.displayName, // красивый ник
        avatarUrl: f.follower.avatarUrl,
      }));

      return res.json({
        ok: true,
        users,
      });
    } catch (err) {
      console.error("Followers list error", err);
      return res
        .status(500)
        .json({ ok: false, message: "Не удалось загрузить подписчиков" });
    }
  }
);

export default router;
