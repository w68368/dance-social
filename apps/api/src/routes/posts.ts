// apps/api/src/routes/posts.ts
import type { Express } from "express";
import { Router } from "express";
import { z } from "zod";
import path from "path";
import fs from "fs";
import multer from "multer";

import { prisma } from "../lib/prisma.js";
import { cloudinary } from "../lib/cloudinary.js";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth.js";

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
// Валидация подписи
// -----------------------------
const captionSchema = z
  .string()
  .max(1000, "Слишком длинный текст")
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

      // Для только что созданного поста лайков ещё нет
      const responsePost = {
        ...post,
        likesCount: 0,
        likedByMe: false,
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
// GET /api/posts
// Лента постов с количеством лайков
// -----------------------------
router.get("/", async (_req, res) => {
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
          },
        },
      },
    });

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
      likedByMe: false, // позже можно вычислять, если будем знать текущего юзера
    }));

    res.json({ ok: true, posts: shaped });
  } catch (err) {
    console.error("Fetch posts error:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

// Посты одного пользователя: GET /api/posts/user/:userId
router.get("/user/:userId", async (req, res) => {
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
          },
        },
      },
    });

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
      likedByMe: false, // позже можно учесть текущего юзера
    }));

    res.json({ ok: true, posts: shaped });
  } catch (err) {
    console.error("Fetch user's posts error:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

export default router;
