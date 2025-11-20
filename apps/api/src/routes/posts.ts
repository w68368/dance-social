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
              avatarUrl: true,
            },
          },
        },
      });

      // Для только что созданного поста лайков и комментариев ещё нет
      const responsePost = {
        ...post,
        likesCount: 0,
        likedByMe: false,
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
// POST /api/posts/:id/like
// Тоггл лайка для текущего пользователя
// -----------------------------
router.post("/:id/like", requireAuth, async (req: AuthedRequest, res) => {
  if (!req.userId) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }

  const postId = req.params.id;

  try {
    // Проверяем, есть ли уже лайк
    const existing = await prisma.postLike.findUnique({
      where: {
        userId_postId: {
          userId: req.userId,
          postId,
        },
      },
    });

    let liked: boolean;

    if (existing) {
      // Уже лайкнул → убираем лайк
      await prisma.postLike.delete({
        where: { id: existing.id },
      });
      liked = false;
    } else {
      // Лайка не было → создаём
      await prisma.postLike.create({
        data: {
          userId: req.userId,
          postId,
        },
      });
      liked = true;
    }

    // Пересчитываем количество лайков
    const likesCount = await prisma.postLike.count({
      where: { postId },
    });

    return res.json({
      ok: true,
      liked,
      likesCount,
    });
  } catch (err) {
    console.error("Toggle like error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Не удалось обновить лайк" });
  }
});

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
      // если это ответ — проверим, что parent принадлежит тому же посту
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
              avatarUrl: true,
            },
          },
        },
      });

      res.json({ ok: true, comment });
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
// Получить комментарии поста (flat-список с parentId)
// -----------------------------
router.get("/:id/comments", async (req, res) => {
  const postId = req.params.id;

  try {
    const comments = await prisma.postComment.findMany({
      where: { postId },
      orderBy: { createdAt: "asc" },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.json({ ok: true, comments });
  } catch (err) {
    console.error("Fetch comments error:", err);
    res
      .status(500)
      .json({ ok: false, message: "Не удалось загрузить комментарии" });
  }
});

// -----------------------------
// GET /api/posts
// Лента постов с количеством лайков и комментариев
// + признак likedByMe для текущего пользователя
// -----------------------------
router.get("/", optionalAuth, async (req: AuthedRequest, res) => {
  try {
    const posts = await prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
        // нужно, чтобы определить likedByMe
        likes: {
          select: {
            userId: true,
          },
        },
      },
    });

    const currentUserId = req.userId;

    const shaped = posts.map((p) => ({
      id: p.id,
      caption: p.caption,
      mediaType: p.mediaType,
      mediaUrl: p.mediaUrl,
      mediaLocalPath: p.mediaLocalPath,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      author: p.author,
      likesCount: p._count.likes,
      likedByMe: currentUserId
        ? p.likes.some((l) => l.userId === currentUserId)
        : false,
      commentsCount: p._count.comments,
    }));

    res.json({ ok: true, posts: shaped });
  } catch (err) {
    console.error("Fetch posts error:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

// -----------------------------
// GET /api/posts/user/:userId
// Посты одного пользователя (для профиля)
// тоже с likedByMe и количеством комментариев
// -----------------------------
router.get("/user/:userId", optionalAuth, async (req: AuthedRequest, res) => {
  try {
    const { userId } = req.params;

    const posts = await prisma.post.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
        likes: {
          select: {
            userId: true,
          },
        },
      },
    });

    const currentUserId = req.userId;

    const shaped = posts.map((p) => ({
      id: p.id,
      caption: p.caption,
      mediaType: p.mediaType,
      mediaUrl: p.mediaUrl,
      mediaLocalPath: p.mediaLocalPath,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      author: p.author,
      likesCount: p._count.likes,
      likedByMe: currentUserId
        ? p.likes.some((l) => l.userId === currentUserId)
        : false,
      commentsCount: p._count.comments,
    }));

    res.json({ ok: true, posts: shaped });
  } catch (err) {
    console.error("Fetch user's posts error:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

export default router;
