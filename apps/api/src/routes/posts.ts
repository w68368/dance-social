// apps/api/src/routes/posts.ts
import type { Express } from "express";
import { Router } from "express";
import { z } from "zod";
import path from "path";
import fs from "fs";
import multer from "multer";

import { prisma } from "../lib/prisma.js";
import { cloudinary } from "../lib/cloudinary.js";
import {
  requireAuth,
  optionalAuth,
  type AuthedRequest,
} from "../middlewares/requireAuth.js";

const router = Router();

// ----------------------------------
// Конфиг реакций
// ----------------------------------
const REACTION_TYPES = ["LIKE", "FIRE", "WOW", "CUTE", "CLAP"] as const;
type ReactionType = (typeof REACTION_TYPES)[number];

type PostReactionsSummary = {
  postId: string;
  counts: Record<ReactionType, number>;
  myReaction: ReactionType | null;
};

// -----------------------------
// Настройка папок
// -----------------------------
const uploadsRoot =
  process.env.UPLOAD_DIR && process.env.UPLOAD_DIR.trim().length > 0
    ? path.join(process.cwd(), process.env.UPLOAD_DIR)
    : path.join(process.cwd(), "uploads");

const postMediaDir = path.join(uploadsRoot, "posts");
if (!fs.existsSync(postMediaDir)) {
  fs.mkdirSync(postMediaDir, { recursive: true });
}

// -----------------------------
// Multer-config
// -----------------------------
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB) || 100;
const upload = multer({
  dest: postMediaDir,
  limits: {
    fileSize: maxUploadMb * 1024 * 1024,
  },
});

// -----------------------------
// Валидация текста
// -----------------------------
const captionSchema = z
  .string()
  .max(1000, "Слишком длинный текст")
  .transform((v) => v.trim());

const commentSchema = z
  .string()
  .min(1, "Комментарий не может быть пустым")
  .max(500, "Слишком длинный комментарий")
  .transform((v) => v.trim());

// тело для реакций
const reactSchema = z.object({
  type: z.enum(["LIKE", "FIRE", "WOW", "CUTE", "CLAP"]),
});

// -----------------------------
// POST /api/posts
// Создать пост (текст + optional медиа)
// -----------------------------
router.post(
  "/",
  requireAuth,
  upload.single("media"),
  async (req: AuthedRequest & { file?: Express.Multer.File }, res) => {
    if (!req.userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const file = req.file ?? undefined;
    const rawCaption =
      typeof req.body.caption === "string" ? req.body.caption : "";
    const parsedCaption = captionSchema.safeParse(rawCaption);
    const caption = parsedCaption.success ? parsedCaption.data : "";

    if (!caption && !file) {
      return res.status(400).json({
        ok: false,
        message: "Добавь текст или прикрепи фото/видео к посту 🙂",
      });
    }

    let mediaType: string | null = null;
    let mediaUrl: string | null = null;
    let mediaLocalPath: string | null = null;

    try {
      // ==== Обработка файла ====
      if (file) {
        const isImage = file.mimetype.startsWith("image/");
        const isVideo = file.mimetype.startsWith("video/");

        if (!isImage && !isVideo) {
          return res.status(400).json({
            ok: false,
            message: "Поддерживаются только изображения и видео",
          });
        }

        const uploadResult = await cloudinary.uploader.upload(file.path, {
          resource_type: "auto",
          folder: process.env.CLOUDINARY_UPLOAD_FOLDER || "stepunity/posts",
        });

        mediaType = isVideo ? "video" : "image";
        mediaUrl = uploadResult.secure_url;
        mediaLocalPath = path.relative(process.cwd(), file.path);
      }

      const post = await prisma.post.create({
        data: {
          caption,
          authorId: req.userId,
          mediaType,
          mediaUrl,
          mediaLocalPath,
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      });

      const responsePost = {
        ...post,
        likesCount: 0, // суммарные реакции (пока 0)
        likedByMe: false,
        myReaction: null as ReactionType | null,
        commentsCount: 0,
      };

      res.json({ ok: true, post: responsePost });
    } catch (err: any) {
      console.error("Create post error:", err);

      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          ok: false,
          message: `Файл слишком большой. Максимальный размер: ${maxUploadMb}MB`,
        });
      }

      return res.status(500).json({
        ok: false,
        message: err?.message || "Server error",
      });
    }
  }
);

// -----------------------------
// 🆕 POST /api/posts/:id/react
// Поставить / изменить / снять реакцию
// -----------------------------
router.post("/:id/react", requireAuth, async (req: AuthedRequest, res) => {
  if (!req.userId) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }

  const postId = req.params.id;
  const parsed = reactSchema.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, message: "Invalid reaction type" });
  }

  const { type } = parsed.data;

  try {
    const existing = await prisma.postReaction.findUnique({
      where: {
        postId_userId: {
          postId,
          userId: req.userId,
        },
      },
    });

    let myReaction: ReactionType | null = null;

    if (existing && existing.type === type) {
      // Нажали ту же реакцию -> удалить
      await prisma.postReaction.delete({
        where: { id: existing.id },
      });
      myReaction = null;
    } else if (existing) {
      // Поменять тип реакции
      const updated = await prisma.postReaction.update({
        where: { id: existing.id },
        data: { type },
      });
      myReaction = updated.type as ReactionType;
    } else {
      // Создать новую реакцию
      const created = await prisma.postReaction.create({
        data: {
          postId,
          userId: req.userId,
          type,
        },
      });
      myReaction = created.type as ReactionType;
    }

    const grouped = await prisma.postReaction.groupBy({
      where: { postId },
      by: ["type"],
      _count: { _all: true },
    });

    const counts: Record<ReactionType, number> = {
      LIKE: 0,
      FIRE: 0,
      WOW: 0,
      CUTE: 0,
      CLAP: 0,
    };

    for (const g of grouped) {
      counts[g.type as ReactionType] = g._count._all;
    }

    const summary: PostReactionsSummary = {
      postId,
      counts,
      myReaction,
    };

    return res.json({ ok: true, reactions: summary });
  } catch (err) {
    console.error("React to post error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Не удалось обновить реакцию" });
  }
});

// -----------------------------
// 🆕 GET /api/posts/:id/reactions
// Получить сводку реакций поста
// -----------------------------
router.get("/:id/reactions", optionalAuth, async (req: AuthedRequest, res) => {
  const postId = req.params.id;
  const userId = req.userId ?? null;

  try {
    const grouped = await prisma.postReaction.groupBy({
      where: { postId },
      by: ["type"],
      _count: { _all: true },
    });

    const counts: Record<ReactionType, number> = {
      LIKE: 0,
      FIRE: 0,
      WOW: 0,
      CUTE: 0,
      CLAP: 0,
    };

    for (const g of grouped) {
      counts[g.type as ReactionType] = g._count._all;
    }

    let myReaction: ReactionType | null = null;

    if (userId) {
      const mine = await prisma.postReaction.findUnique({
        where: {
          postId_userId: {
            postId,
            userId,
          },
        },
        select: { type: true },
      });

      if (mine) {
        myReaction = mine.type as ReactionType;
      }
    }

    const summary: PostReactionsSummary = {
      postId,
      counts,
      myReaction,
    };

    return res.json({ ok: true, reactions: summary });
  } catch (e) {
    console.error("Get post reactions error:", e);
    return res
      .status(500)
      .json({ ok: false, message: "Не удалось загрузить реакции" });
  }
});

// -----------------------------
// POST /api/posts/comments/:commentId/like
// Тоггл лайка на комментарий
// -----------------------------
router.post(
  "/comments/:commentId/like",
  requireAuth,
  async (req: AuthedRequest, res) => {
    if (!req.userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const commentId = req.params.commentId;

    try {
      const existing = await prisma.commentLike.findUnique({
        where: {
          userId_commentId: {
            userId: req.userId,
            commentId,
          },
        },
      });

      let liked: boolean;

      if (existing) {
        await prisma.commentLike.delete({
          where: { id: existing.id },
        });
        liked = false;
      } else {
        await prisma.commentLike.create({
          data: {
            userId: req.userId,
            commentId,
          },
        });
        liked = true;
      }

      const likesCount = await prisma.commentLike.count({
        where: { commentId },
      });

      return res.json({ ok: true, liked, likesCount });
    } catch (err) {
      console.error("Toggle comment like error:", err);
      return res.status(500).json({
        ok: false,
        message: "Не удалось обновить лайк комментария",
      });
    }
  }
);

// -----------------------------
// PATCH /api/posts/comments/:id
// Редактирование своего комментария
// -----------------------------
router.patch("/comments/:id", requireAuth, async (req: AuthedRequest, res) => {
  if (!req.userId) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }

  const commentId = req.params.id;
  const rawText = typeof req.body.text === "string" ? req.body.text : "";
  const parsed = commentSchema.safeParse(rawText);

  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Неверный комментарий",
    });
  }

  try {
    const existing = await prisma.postComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        authorId: true,
      },
    });

    if (!existing) {
      return res
        .status(404)
        .json({ ok: false, message: "Комментарий не найден" });
    }

    if (existing.authorId !== req.userId) {
      return res.status(403).json({
        ok: false,
        message: "Можно редактировать только свои комментарии",
      });
    }

    const updated = await prisma.postComment.update({
      where: { id: commentId },
      data: { text: parsed.data },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        likes: {
          where: { userId: req.userId },
          select: { userId: true },
        },
        _count: {
          select: { likes: true },
        },
      },
    });

    const shaped = {
      id: updated.id,
      text: updated.text,
      postId: updated.postId,
      parentId: updated.parentId,
      isPinned: updated.isPinned,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      author: updated.author,
      likesCount: updated._count.likes,
      likedByMe: updated.likes.length > 0,
    };

    return res.json({ ok: true, comment: shaped });
  } catch (err) {
    console.error("Edit comment error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Не удалось обновить комментарий" });
  }
});

// -----------------------------
// DELETE /api/posts/comments/:id
// Удаление своего комментария
// -----------------------------
router.delete("/comments/:id", requireAuth, async (req: AuthedRequest, res) => {
  if (!req.userId) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }

  const commentId = req.params.id;

  try {
    const existing = await prisma.postComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        authorId: true,
      },
    });

    if (!existing) {
      return res
        .status(404)
        .json({ ok: false, message: "Комментарий не найден" });
    }

    if (existing.authorId !== req.userId) {
      return res.status(403).json({
        ok: false,
        message: "Можно удалять только свои комментарии",
      });
    }

    await prisma.postComment.delete({ where: { id: commentId } });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Delete comment error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Не удалось удалить комментарий" });
  }
});

// -----------------------------
// POST /api/posts/:postId/comments/:commentId/pin
// Автор поста закрепляет / открепляет комментарий
// -----------------------------
router.post(
  "/:postId/comments/:commentId/pin",
  requireAuth,
  async (req: AuthedRequest, res) => {
    if (!req.userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const { postId, commentId } = req.params;

    try {
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { authorId: true },
      });

      if (!post || post.authorId !== req.userId) {
        return res
          .status(403)
          .json({ ok: false, message: "Недостаточно прав" });
      }

      const comment = await prisma.postComment.findUnique({
        where: { id: commentId },
        select: { id: true, postId: true, isPinned: true },
      });

      if (!comment || comment.postId !== postId) {
        return res
          .status(400)
          .json({ ok: false, message: "Комментарий не найден у этого поста" });
      }

      let pinnedCommentId: string | null = null;

      if (comment.isPinned) {
        await prisma.postComment.update({
          where: { id: commentId },
          data: { isPinned: false },
        });
        pinnedCommentId = null;
      } else {
        await prisma.$transaction([
          prisma.postComment.updateMany({
            where: { postId, isPinned: true },
            data: { isPinned: false },
          }),
          prisma.postComment.update({
            where: { id: commentId },
            data: { isPinned: true },
          }),
        ]);
        pinnedCommentId = commentId;
      }

      return res.json({ ok: true, pinnedCommentId });
    } catch (err) {
      console.error("Pin comment error:", err);
      return res.status(500).json({
        ok: false,
        message: "Не удалось обновить закреп комментария",
      });
    }
  }
);

// -----------------------------
// POST /api/posts/:id/comments
// Добавить комментарий к посту (опционально ответ на другой комментарий)
// -----------------------------
router.post(
  "/:id/comments",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ ok: false, message: "Unauthorized" });
      return;
    }

    const postId = req.params.id;
    const rawText = typeof req.body.text === "string" ? req.body.text : "";
    const parentId =
      typeof req.body.parentId === "string" && req.body.parentId.trim().length
        ? req.body.parentId.trim()
        : undefined;

    const parsed = commentSchema.safeParse(rawText);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Неверный комментарий",
      });
      return;
    }

    try {
      if (parentId) {
        const parent = await prisma.postComment.findUnique({
          where: { id: parentId },
          select: { postId: true },
        });

        if (!parent || parent.postId !== postId) {
          res.status(400).json({
            ok: false,
            message: "Неверный родительский комментарий",
          });
          return;
        }
      }

      const comment = await prisma.postComment.create({
        data: {
          text: parsed.data,
          postId,
          authorId: req.userId,
          parentId: parentId ?? null,
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      });

      const shaped = {
        id: comment.id,
        text: comment.text,
        createdAt: comment.createdAt,
        author: comment.author,
        parentId: comment.parentId,
        likesCount: 0,
        likedByMe: false,
        isPinned: false,
      };

      res.json({ ok: true, comment: shaped });
    } catch (err) {
      console.error("Create comment error:", err);
      res
        .status(500)
        .json({ ok: false, message: "Не удалось добавить комментарий" });
    }
  }
);

// -----------------------------
// GET /api/posts/:id/comments
// Получить комментарии поста с сортировкой и пагинацией
// -----------------------------
router.get("/:id/comments", optionalAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const postId = req.params.id;

  const rawLimit = Number(req.query.limit) || 20;
  const limit = Math.min(rawLimit, 50);
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;

  type CommentSortMode = "best" | "new" | "old";
  const rawSort = typeof req.query.sort === "string" ? req.query.sort : "best";
  const sort: CommentSortMode =
    rawSort === "new" || rawSort === "old" ? rawSort : "best";

  const orderBy: any[] = [{ isPinned: "desc" }];

  if (sort === "best") {
    orderBy.push({ likes: { _count: "desc" } }, { createdAt: "desc" });
  } else if (sort === "new") {
    orderBy.push({ createdAt: "desc" });
  } else {
    orderBy.push({ createdAt: "asc" });
  }

  try {
    const comments = await prisma.postComment.findMany({
      where: { postId },
      orderBy,
      take: limit + 1,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        likes: userId
          ? {
              where: { userId },
              select: { userId: true },
            }
          : false,
        _count: {
          select: { likes: true },
        },
      },
    });

    let nextCursor: string | null = null;
    let items = comments;

    if (items.length > limit) {
      const last = items.pop();
      nextCursor = last ? last.id : null;
    }

    const result = items.map((c: any) => ({
      id: c.id,
      text: c.text,
      postId: c.postId,
      parentId: c.parentId,
      isPinned: c.isPinned,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      author: c.author,
      likesCount: c._count.likes,
      likedByMe: userId
        ? !!c.likes?.some((l: any) => l.userId === userId)
        : false,
    }));

    return res.json({
      ok: true,
      comments: result,
      nextCursor,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      ok: false,
      message: "Failed to load comments",
    });
  }
});

// -----------------------------
// GET /api/posts
// Лента постов
// -----------------------------
router.get("/", optionalAuth, async (req: AuthedRequest, res) => {
  try {
    const currentUserId = req.userId ?? null;

    const posts = await prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            reactions: true,
            comments: true,
          },
        },
        reactions: currentUserId
          ? {
              where: { userId: currentUserId },
              select: { type: true },
            }
          : false,
      },
    });

    const shaped = posts.map((p: any) => {
      const myReaction: ReactionType | null =
        currentUserId && Array.isArray(p.reactions) && p.reactions.length > 0
          ? (p.reactions[0].type as ReactionType)
          : null;

      return {
        id: p.id,
        caption: p.caption,
        mediaType: p.mediaType,
        mediaUrl: p.mediaUrl,
        mediaLocalPath: p.mediaLocalPath,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        author: p.author,
        likesCount: p._count.reactions, // суммарное число реакций
        likedByMe: !!myReaction, // для старого UI
        myReaction,
        commentsCount: p._count.comments,
      };
    });

    res.json({ ok: true, posts: shaped });
  } catch (err) {
    console.error("Fetch posts error:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

// -----------------------------
// GET /api/posts/user/:userId
// Посты одного пользователя (для профиля)
// -----------------------------
router.get("/user/:userId", optionalAuth, async (req: AuthedRequest, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.userId ?? null;

    const posts = await prisma.post.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            reactions: true,
            comments: true,
          },
        },
        reactions: currentUserId
          ? {
              where: { userId: currentUserId },
              select: { type: true },
            }
          : false,
      },
    });

    const shaped = posts.map((p: any) => {
      const myReaction: ReactionType | null =
        currentUserId && Array.isArray(p.reactions) && p.reactions.length > 0
          ? (p.reactions[0].type as ReactionType)
          : null;

      return {
        id: p.id,
        caption: p.caption,
        mediaType: p.mediaType,
        mediaUrl: p.mediaUrl,
        mediaLocalPath: p.mediaLocalPath,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        author: p.author,
        likesCount: p._count.reactions,
        likedByMe: !!myReaction,
        myReaction,
        commentsCount: p._count.comments,
      };
    });

    res.json({ ok: true, posts: shaped });
  } catch (err) {
    console.error("Fetch user's posts error:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

export default router;
