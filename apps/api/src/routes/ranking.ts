import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.get("/", async (req, res) => {
  const take = Math.min(parseInt(String(req.query.take ?? "50"), 10) || 50, 200);

  const users = await prisma.user.findMany({
    orderBy: [
      { points: "desc" },
      { pointsUpdatedAt: "asc" },
      { createdAt: "asc" },
    ],
    take,
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      points: true,
    },
  });

  res.json({ items: users });
});

export default router;