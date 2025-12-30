import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth.js";
import { z } from "zod";

const router = Router();

// GET /api/notifications?unreadOnly=1&take=20
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const takeRaw = parseInt(String(req.query.take ?? "20"), 10);
  const take = Math.min(Math.max(isNaN(takeRaw) ? 20 : takeRaw, 1), 50);
  const unreadOnly = String(req.query.unreadOnly ?? "0") === "1";

  const items = await prisma.notification.findMany({
    where: {
      userId,
      ...(unreadOnly ? { isRead: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  res.json({ items });
});

// GET /api/notifications/unread-count
router.get("/unread-count", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const count = await prisma.notification.count({
    where: { userId, isRead: false },
  });
  res.json({ count });
});

// POST /api/notifications/mark-read  { ids: string[] }
router.post("/mark-read", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const schema = z.object({ ids: z.array(z.string().min(1)).min(1) });
  const { ids } = schema.parse(req.body);

  await prisma.notification.updateMany({
    where: { userId, id: { in: ids } },
    data: { isRead: true, readAt: new Date() },
  });

  res.json({ ok: true });
});

// POST /api/notifications/mark-all-read
router.post("/mark-all-read", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  res.json({ ok: true });
});

// DELETE /api/notifications/:id  (delete one)
router.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const id = String(req.params.id || "");

  if (!id) return res.status(400).json({ ok: false, message: "Missing id" });

  // delete only own notifications
  const result = await prisma.notification.deleteMany({
    where: { id, userId },
  });

  if (result.count === 0) {
    return res.status(404).json({ ok: false, message: "Not found" });
  }

  return res.json({ ok: true, deletedId: id });
});

// DELETE /api/notifications (delete all)
router.delete("/", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const result = await prisma.notification.deleteMany({
    where: { userId },
  });

  return res.json({ ok: true, deleted: result.count });
});

// DELETE /api/notifications/read (delete only read)
router.delete("/read/all", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const result = await prisma.notification.deleteMany({
    where: { userId, isRead: true },
  });

  return res.json({ ok: true, deleted: result.count });
});


export default router;
