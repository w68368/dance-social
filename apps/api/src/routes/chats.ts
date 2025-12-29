// apps/api/src/routes/chats.ts
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth.js";

const router = Router();

/**
 * Reply payload (short preview)
 */
const replySelect = {
  id: true,
  text: true,
  createdAt: true,
  editedAt: true,
  senderId: true,
} as const;

/**
 * Message select (includes replyTo)
 */
const messageSelect = {
  id: true,
  text: true,
  createdAt: true,
  editedAt: true,
  senderId: true,
  replyToId: true,
  replyTo: { select: replySelect },
} as const;

/**
 * Create or get DM conversation with userId.
 * Returns conversation + basic peer user.
 */
router.post("/dm/:userId", requireAuth, async (req: AuthedRequest, res) => {
  if (!req.userId)
    return res.status(401).json({ ok: false, message: "Unauthorized" });

  const otherUserId = req.params.userId;
  if (!otherUserId)
    return res.status(400).json({ ok: false, message: "Missing userId" });
  if (otherUserId === req.userId) {
    return res
      .status(400)
      .json({ ok: false, message: "You can't message yourself" });
  }

  const meId = req.userId;

  // ensure other user exists
  const other = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  });
  if (!other)
    return res.status(404).json({ ok: false, message: "User not found" });

  // Find existing conversation that has exactly these two participants
  const existing = await prisma.conversation.findFirst({
    where: {
      participants: {
        every: { userId: { in: [meId, otherUserId] } },
      },
      AND: [
        { participants: { some: { userId: meId } } },
        { participants: { some: { userId: otherUserId } } },
      ],
    },
    select: { id: true },
  });

  const conv =
    existing ??
    (await prisma.conversation.create({
      data: {
        participants: {
          create: [{ userId: meId }, { userId: otherUserId }],
        },
      },
      select: { id: true },
    }));

  return res.json({ ok: true, conversationId: conv.id, peer: other });
});

/**
 * List my conversations (DMs). Includes peer user + last message.
 */
router.get("/conversations", requireAuth, async (req: AuthedRequest, res) => {
  if (!req.userId)
    return res.status(401).json({ ok: false, message: "Unauthorized" });

  const meId = req.userId;

  const convs = await prisma.conversation.findMany({
    where: { participants: { some: { userId: meId } } },
    orderBy: { updatedAt: "desc" },
    include: {
      participants: {
        include: {
          user: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      },
      messages: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          text: true,
          createdAt: true,
          editedAt: true,
          senderId: true,
          replyToId: true, // ✅
        },
      },
    },
  });

  const shaped = convs.map((c) => {
    const peer = c.participants.find((p) => p.userId !== meId)?.user ?? null;
    const last = c.messages[0] ?? null;
    return {
      id: c.id,
      updatedAt: c.updatedAt,
      peer,
      lastMessage: last,
    };
  });

  return res.json({ ok: true, conversations: shaped });
});

/**
 * Get messages of a conversation (only if participant)
 */
router.get(
  "/conversations/:id/messages",
  requireAuth,
  async (req: AuthedRequest, res) => {
    if (!req.userId)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    const meId = req.userId;
    const convId = req.params.id;

    const isMember = await prisma.conversationParticipant.findFirst({
      where: { conversationId: convId, userId: meId },
      select: { id: true },
    });
    if (!isMember) return res.status(403).json({ ok: false, message: "Forbidden" });

    const messages = await prisma.message.findMany({
      where: { conversationId: convId },
      orderBy: { createdAt: "asc" },
      select: messageSelect, // ✅ replyTo included
    });

    return res.json({ ok: true, messages });
  }
);

/**
 * Send message (supports replyToId)
 */
router.post(
  "/conversations/:id/messages",
  requireAuth,
  async (req: AuthedRequest, res) => {
    if (!req.userId)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    const meId = req.userId;
    const convId = req.params.id;

    const schema = z.object({
      text: z.string().trim().min(1).max(2000),
      replyToId: z.string().trim().min(1).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ ok: false, message: "Invalid message" });

    const isMember = await prisma.conversationParticipant.findFirst({
      where: { conversationId: convId, userId: meId },
      select: { id: true },
    });
    if (!isMember) return res.status(403).json({ ok: false, message: "Forbidden" });

    const replyToId = parsed.data.replyToId;

    // ✅ validate reply target belongs to the same conversation
    if (replyToId) {
      const target = await prisma.message.findUnique({
        where: { id: replyToId },
        select: { id: true, conversationId: true },
      });

      if (!target || target.conversationId !== convId) {
        return res
          .status(400)
          .json({ ok: false, message: "Invalid reply target" });
      }
    }

    const msg = await prisma.message.create({
      data: {
        conversationId: convId,
        senderId: meId,
        text: parsed.data.text,
        replyToId: replyToId ?? null,
      },
      select: messageSelect, // ✅ includes replyTo
    });

    // bump updatedAt
    await prisma.conversation.update({
      where: { id: convId },
      data: { updatedAt: new Date() },
      select: { id: true },
    });

    return res.json({ ok: true, message: msg });
  }
);

/**
 * DELETE own message
 * DELETE /api/chats/messages/:messageId
 */
router.delete(
  "/messages/:messageId",
  requireAuth,
  async (req: AuthedRequest, res) => {
    if (!req.userId)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    const messageId = req.params.messageId;

    try {
      const msg = await prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, senderId: true, conversationId: true },
      });

      if (!msg) {
        return res.status(404).json({ ok: false, message: "Message not found" });
      }

      // safety: ensure deleter is still a participant
      const isMember = await prisma.conversationParticipant.findFirst({
        where: { conversationId: msg.conversationId, userId: req.userId },
        select: { id: true },
      });
      if (!isMember) return res.status(403).json({ ok: false, message: "Forbidden" });

      // only sender can delete
      if (msg.senderId !== req.userId) {
        return res.status(403).json({ ok: false, message: "Forbidden" });
      }

      await prisma.message.delete({ where: { id: messageId } });

      return res.json({ ok: true, deletedId: messageId });
    } catch (err) {
      console.error("Delete message error", err);
      return res
        .status(500)
        .json({ ok: false, message: "Failed to delete message" });
    }
  }
);

/**
 * PATCH edit own message
 * PATCH /api/chats/messages/:messageId
 */
router.patch(
  "/messages/:messageId",
  requireAuth,
  async (req: AuthedRequest, res) => {
    if (!req.userId)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    const messageId = req.params.messageId;

    const schema = z.object({ text: z.string().trim().min(1).max(2000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ ok: false, message: "Invalid message" });

    try {
      const msg = await prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, senderId: true, conversationId: true },
      });

      if (!msg) {
        return res.status(404).json({ ok: false, message: "Message not found" });
      }

      // safety: ensure editor is still a participant
      const isMember = await prisma.conversationParticipant.findFirst({
        where: { conversationId: msg.conversationId, userId: req.userId },
        select: { id: true },
      });
      if (!isMember) return res.status(403).json({ ok: false, message: "Forbidden" });

      // only sender can edit
      if (msg.senderId !== req.userId) {
        return res.status(403).json({ ok: false, message: "Forbidden" });
      }

      const updated = await prisma.message.update({
        where: { id: messageId },
        data: { text: parsed.data.text, editedAt: new Date() },
        select: messageSelect, // ✅ includes replyTo
      });

      // bump updatedAt
      await prisma.conversation.update({
        where: { id: msg.conversationId },
        data: { updatedAt: new Date() },
        select: { id: true },
      });

      return res.json({ ok: true, message: updated });
    } catch (err) {
      console.error("Edit message error", err);
      return res
        .status(500)
        .json({ ok: false, message: "Failed to edit message" });
    }
  }
);

export default router;
