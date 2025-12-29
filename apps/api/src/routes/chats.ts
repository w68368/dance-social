// apps/api/src/routes/chats.ts
import { Router } from "express";
import { z } from "zod";
import path from "path";
import fs from "fs";
import multer from "multer";

import { prisma } from "../lib/prisma.js";
import { cloudinary } from "../lib/cloudinary.js";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth.js";

const router = Router();

/**
 * Chat media upload (local temp -> Cloudinary)
 */
const chatMediaDir = path.join(process.cwd(), "uploads", "chat-media");
if (!fs.existsSync(chatMediaDir)) fs.mkdirSync(chatMediaDir, { recursive: true });

const uploadChatMedia = multer({
  dest: chatMediaDir,
  limits: {
    fileSize: (Number(process.env.MAX_CHAT_UPLOAD_MB) || 30) * 1024 * 1024, // default 30MB
  },
});

/**
 * Reply payload (short preview)
 */
const replySelect = {
  id: true,
  text: true,
  createdAt: true,
  editedAt: true,
  senderId: true,
  mediaType: true,
  mediaUrl: true,
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
  mediaType: true,
  mediaUrl: true,
  replyToId: true,
  replyTo: { select: replySelect },
} as const;

async function ensureMember(conversationId: string, userId: string) {
  const isMember = await prisma.conversationParticipant.findFirst({
    where: { conversationId, userId },
    select: { id: true },
  });
  return Boolean(isMember);
}

async function validateReplyTarget(replyToId: string, convId: string) {
  const target = await prisma.message.findUnique({
    where: { id: replyToId },
    select: { id: true, conversationId: true },
  });
  return Boolean(target && target.conversationId === convId);
}

function safeUnlink(filePath: string) {
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

function getMulterFiles(req: AuthedRequest): Express.Multer.File[] {
  // multer adds req.files dynamically; keep handler signature compatible with express overloads
  const anyReq = req as unknown as { files?: Express.Multer.File[] };
  return anyReq.files ?? [];
}

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
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
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
          replyToId: true,
          mediaType: true,
          mediaUrl: true,
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

    const isMember = await ensureMember(convId, meId);
    if (!isMember)
      return res.status(403).json({ ok: false, message: "Forbidden" });

    const messages = await prisma.message.findMany({
      where: { conversationId: convId },
      orderBy: { createdAt: "asc" },
      select: messageSelect,
    });

    return res.json({ ok: true, messages });
  }
);

/**
 * Send text message (supports replyToId)
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

    const isMember = await ensureMember(convId, meId);
    if (!isMember)
      return res.status(403).json({ ok: false, message: "Forbidden" });

    const replyToId = parsed.data.replyToId;

    if (replyToId) {
      const ok = await validateReplyTarget(replyToId, convId);
      if (!ok)
        return res
          .status(400)
          .json({ ok: false, message: "Invalid reply target" });
    }

    const msg = await prisma.message.create({
      data: {
        conversationId: convId,
        senderId: meId,
        text: parsed.data.text,
        replyToId: replyToId ?? null,
        mediaType: null,
        mediaUrl: null,
      },
      select: messageSelect,
    });

    await prisma.conversation.update({
      where: { id: convId },
      data: { updatedAt: new Date() },
      select: { id: true },
    });

    return res.json({ ok: true, message: msg });
  }
);

/**
 * Send media message(s) (image/video), multiple files in one request.
 * POST /api/chats/conversations/:id/messages/media
 * multipart/form-data:
 * - media: File[] (required)
 * - text: string (optional)  -> goes into the FIRST created message
 * - replyToId: string (optional)
 */
router.post(
  "/conversations/:id/messages/media",
  requireAuth,
  uploadChatMedia.array("media", 10),
  async (req: AuthedRequest, res) => {
    if (!req.userId)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    const meId = req.userId;
    const convId = req.params.id;

    const isMember = await ensureMember(convId, meId);
    if (!isMember)
      return res.status(403).json({ ok: false, message: "Forbidden" });

    const files = getMulterFiles(req);
    if (!files.length) {
      return res
        .status(400)
        .json({ ok: false, message: "No media files provided" });
    }

    const schema = z.object({
      text: z.string().trim().max(2000).optional(),
      replyToId: z.string().trim().min(1).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      for (const f of files) safeUnlink(f.path);
      return res.status(400).json({ ok: false, message: "Invalid payload" });
    }

    const replyToId = parsed.data.replyToId;
    if (replyToId) {
      const ok = await validateReplyTarget(replyToId, convId);
      if (!ok) {
        for (const f of files) safeUnlink(f.path);
        return res
          .status(400)
          .json({ ok: false, message: "Invalid reply target" });
      }
    }

    // validate mimetypes
    for (const f of files) {
      const ok =
        f.mimetype.startsWith("image/") || f.mimetype.startsWith("video/");
      if (!ok) {
        for (const x of files) safeUnlink(x.path);
        return res.status(400).json({
          ok: false,
          message: "Only images and videos are supported",
        });
      }
    }

    try {
      const uploads = await Promise.all(
        files.map((f) =>
          cloudinary.uploader.upload(f.path, {
            resource_type: "auto",
            folder: process.env.CLOUDINARY_UPLOAD_FOLDER || "stepunity/chats",
          })
        )
      );

      const text = (parsed.data.text ?? "").trim();

      const created = await prisma.$transaction(async (tx) => {
        const msgs = [];

        for (let i = 0; i < uploads.length; i++) {
          const u = uploads[i];
          const isVideo = files[i].mimetype.startsWith("video/");

          const msg = await tx.message.create({
            data: {
              conversationId: convId,
              senderId: meId,
              // put optional text only on the first message
              text: i === 0 ? text : "",
              replyToId: replyToId ?? null,
              mediaType: isVideo ? "video" : "image",
              mediaUrl: u.secure_url,
            },
            select: messageSelect,
          });

          msgs.push(msg);
        }

        await tx.conversation.update({
          where: { id: convId },
          data: { updatedAt: new Date() },
          select: { id: true },
        });

        return msgs;
      });

      return res.json({ ok: true, messages: created });
    } catch (err) {
      console.error("Send multi media message error", err);
      return res
        .status(500)
        .json({ ok: false, message: "Failed to upload media" });
    } finally {
      for (const f of files) safeUnlink(f.path);
    }
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
        return res
          .status(404)
          .json({ ok: false, message: "Message not found" });
      }

      const isMember = await ensureMember(msg.conversationId, req.userId);
      if (!isMember)
        return res.status(403).json({ ok: false, message: "Forbidden" });

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
 * PATCH edit own message (text only)
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
        return res
          .status(404)
          .json({ ok: false, message: "Message not found" });
      }

      const isMember = await ensureMember(msg.conversationId, req.userId);
      if (!isMember)
        return res.status(403).json({ ok: false, message: "Forbidden" });

      if (msg.senderId !== req.userId) {
        return res.status(403).json({ ok: false, message: "Forbidden" });
      }

      const updated = await prisma.message.update({
        where: { id: messageId },
        data: { text: parsed.data.text, editedAt: new Date() },
        select: messageSelect,
      });

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
