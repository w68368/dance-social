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
// Reactions config
// ----------------------------------
const REACTION_TYPES = ["LIKE", "FIRE", "WOW", "CUTE", "CLAP"] as const;
type ReactionType = (typeof REACTION_TYPES)[number];

type PostReactionsSummary = {
  postId: string;
  counts: Record<ReactionType, number>;
  myReaction: ReactionType | null;
};

// -----------------------------
// Setting up folders
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
// Text Validation
// -----------------------------
const CAPTION_MAX_LENGTH = 1000; // signature limit, must match the front

const captionSchema = z
  .string()
  .max(CAPTION_MAX_LENGTH, "The text is too long")
  .transform((v) => v.trim());

const commentSchema = z
  .string()
  .min(1, "Comment cannot be empty")
  .max(500, "The comment is too long.")
  .transform((v) => v.trim());

const reactSchema = z.object({
  type: z.enum(["LIKE", "FIRE", "WOW", "CUTE", "CLAP"]),
});

// -----------------------------
// POST /api/posts
// Create a post (text + optional media)
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

    if (!parsedCaption.success) {
      const firstIssue = parsedCaption.error.issues[0];
      const msg = firstIssue?.message || "Incorrect signature text";
      return res.status(400).json({
        ok: false,
        message: msg,
      });
    }

    const caption = parsedCaption.data;

    if (!caption && !file) {
      return res.status(400).json({
        ok: false,
        message: "Add text or attach a photo/video to the post",
      });
    }

    let mediaType: string | null = null;
    let mediaUrl: string | null = null;
    let mediaLocalPath: string | null = null;

    try {
      if (file) {
        const isImage = file.mimetype.startsWith("image/");
        const isVideo = file.mimetype.startsWith("video/");

        if (!isImage && !isVideo) {
          return res.status(400).json({
            ok: false,
            message: "Only images and videos are supported",
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

      // =====================================
      //    HASHTAGS - a fully working version
      // =====================================

      // Search for #tags in the signature
      const rawTags = caption.match(/#[\wа-яА-ЯёЁ]+/g) ?? [];

      // Remove #, convert to lowercase, remove duplicates
      const cleanedTags = [
        ...new Set(rawTags.map((t) => t.substring(1).toLowerCase())),
      ];

      if (cleanedTags.length > 0) {
        for (const tag of cleanedTags) {
          const hashtag = await prisma.hashtag.upsert({
            where: { tag },
            update: {},
            create: { tag },
          });

          await prisma.postHashtag.create({
            data: {
              postId: post.id,
              hashtagId: hashtag.id,
            },
          });
        }
      }

      const responsePost = {
        ...post,
        likesCount: 0,
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
          message: `The file is too large. Maximum size: ${maxUploadMb}MB`,
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
// Set / change / remove reaction
// + create notification when someone likes a post
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
    // ✅ make sure post exists and we know authorId
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    });

    if (!post) {
      return res.status(404).json({ ok: false, message: "Post not found" });
    }

    let myReaction: ReactionType | null = null;

    // ✅ use transaction to avoid duplicates in race conditions
    await prisma.$transaction(async (tx) => {
      const existing = await tx.postReaction.findUnique({
        where: {
          postId_userId: {
            postId,
            userId: req.userId!,
          },
        },
        select: { id: true, type: true },
      });

      // we will create notif ONLY when the result becomes LIKE
      const prevType = (existing?.type as ReactionType | undefined) ?? null;

      if (existing && existing.type === type) {
        // toggle off
        await tx.postReaction.delete({
          where: { id: existing.id },
        });
        myReaction = null;
        return;
      }

      if (existing) {
        const updated = await tx.postReaction.update({
          where: { id: existing.id },
          data: { type },
          select: { type: true },
        });
        myReaction = updated.type as ReactionType;
      } else {
        const created = await tx.postReaction.create({
          data: {
            postId,
            userId: req.userId!,
            type,
          },
          select: { type: true },
        });
        myReaction = created.type as ReactionType;
      }

      // ✅ create notification ONLY if reaction became LIKE and user is not author
      const becameLike = type === "LIKE" && prevType !== "LIKE";
      const shouldNotify = becameLike && post.authorId !== req.userId;

      if (shouldNotify) {
        const liker = await tx.user.findUnique({
          where: { id: req.userId! },
          select: { username: true, displayName: true },
        });

        const name = liker?.displayName || liker?.username || "Someone";

        // IMPORTANT: make sure NotificationType enum includes POST_LIKE
        await tx.notification.create({
          data: {
            userId: post.authorId,
            type: "POST_LIKE",
            title: "New like",
            body: `${name} liked your post`,
            url: `/?post=${postId}`, // ✅ open feed and later scroll/highlight this post
            entityId: postId,
            isRead: false,
          },
        });
      }
    });

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
      .json({ ok: false, message: "Failed to update reaction" });
  }
});

// -----------------------------
// 🆕 GET /api/posts/:id/reactions
// Get a summary of post reactions
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
      .json({ ok: false, message: "Failed to load reactions" });
  }
});

// -----------------------------
// POST /api/posts/comments/:commentId/like
// Toggle like the comment
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
      // ✅ load comment with author + postId
      const comment = await prisma.postComment.findUnique({
        where: { id: commentId },
        select: {
          id: true,
          postId: true,
          authorId: true,
        },
      });

      if (!comment) {
        return res.status(404).json({ ok: false, message: "Comment not found" });
      }

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

        // ✅ notify only on "like" (not on unlike) and not self-like
        if (comment.authorId !== req.userId) {
          prisma.notification
            .create({
              data: {
                userId: comment.authorId,
                type: "COMMENT_LIKE",
                title: "New like",
                body: "Someone liked your comment",
                url: `/?post=${comment.postId}`,
                entityId: commentId,
                isRead: false,
              },
            })
            .catch((e) => console.error("Notify comment like error:", e));
        }
      }

      const likesCount = await prisma.commentLike.count({
        where: { commentId },
      });

      return res.json({ ok: true, liked, likesCount });
    } catch (err) {
      console.error("Toggle comment like error:", err);
      return res.status(500).json({
        ok: false,
        message: "Failed to update comment like",
      });
    }
  }
);

// -----------------------------
// PATCH /api/posts/comments/:id
// Editing your comment
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
      message: parsed.error.issues[0]?.message ?? "Invalid comment",
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
        .json({ ok: false, message: "Comment not found" });
    }

    if (existing.authorId !== req.userId) {
      return res.status(403).json({
        ok: false,
        message: "You can only edit your own comments.",
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
      .json({ ok: false, message: "Failed to update comment" });
  }
});

// -----------------------------
// DELETE /api/posts/comments/:id
// Deleting your comment
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
        .json({ ok: false, message: "Comment not found" });
    }

    if (existing.authorId !== req.userId) {
      return res.status(403).json({
        ok: false,
        message: "You can only delete your own comments.",
      });
    }

    await prisma.postComment.delete({ where: { id: commentId } });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Delete comment error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Failed to delete comment" });
  }
});

// -----------------------------
// POST /api/posts/:postId/comments/:commentId/pin
// The post author pins / unpins a comment
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
          .json({ ok: false, message: "Insufficient permissions" });
      }

      const comment = await prisma.postComment.findUnique({
        where: { id: commentId },
        select: { id: true, postId: true, isPinned: true },
      });

      if (!comment || comment.postId !== postId) {
        return res
          .status(400)
          .json({ ok: false, message: "Comment not found on this post" });
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
        message: "Failed to update pinned comment",
      });
    }
  }
);

// -----------------------------
// POST /api/posts/:id/comments
// Add a comment to a post (optionally a reply to another comment)
// + create notification for post author
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
        message: parsed.error.issues[0]?.message ?? "Invalid comment",
      });
      return;
    }

    try {
      // ✅ validate parent comment
      if (parentId) {
        const parent = await prisma.postComment.findUnique({
          where: { id: parentId },
          select: { postId: true },
        });

        if (!parent || parent.postId !== postId) {
          res.status(400).json({
            ok: false,
            message: "Invalid parent comment",
          });
          return;
        }
      }

      // ✅ load post author for notification (and validate post exists)
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, authorId: true },
      });

      if (!post) {
        res.status(404).json({ ok: false, message: "Post not found" });
        return;
      }

      // ✅ create comment
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

      // ✅ notify post author (if not self)
      if (post.authorId !== req.userId) {
        prisma.notification
          .create({
            data: {
              userId: post.authorId,
              type: "POST_COMMENT", // IMPORTANT: add to NotificationType enum
              title: `New comment from ${
                comment.author.displayName || comment.author.username
              }`,
              body:
                parsed.data.length > 140
                  ? parsed.data.slice(0, 140) + "…"
                  : parsed.data,
              url: `/?post=${postId}`, // ✅ open feed and later scroll/highlight this post
              entityId: comment.id,
              isRead: false,
            },
          })
          .catch((e) => console.error("Notify post comment error:", e));
      }

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
      res.status(500).json({ ok: false, message: "Failed to add comment" });
    }
  }
);

// -----------------------------
// GET /api/posts/:id/comments
// Get post comments with sorting and pagination
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
// Post feed (cursor pagination)
// -----------------------------
router.get("/", optionalAuth, async (req: AuthedRequest, res) => {
  try {
    const currentUserId = req.userId ?? null;

    const scopeRaw =
      typeof req.query.scope === "string" ? req.query.scope : "all";
    const scope = scopeRaw === "following" ? "following" : "all";

    const rawLimit = Number(req.query.limit) || 5;
    const limit = Math.min(Math.max(rawLimit, 1), 50);
    const cursor =
      typeof req.query.cursor === "string" ? req.query.cursor : null;

    // ✅ WHERE для "Только подписки"
    let where: any = undefined;

    if (scope === "following") {
      if (!currentUserId) {
        return res.status(401).json({ ok: false, message: "Login required" });
      }

      const follows = await prisma.follow.findMany({
        where: { followerId: currentUserId },
        select: { followingId: true },
      });

      const followingIds = follows.map((f) => f.followingId);

      // показываем посты тех, на кого подписан + свои
      where = {
        OR: [{ authorId: currentUserId }, { authorId: { in: followingIds } }],
      };
    }

    const rows = await prisma.post.findMany({
      where,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        _count: { select: { reactions: true, comments: true } },
        reactions: currentUserId
          ? { where: { userId: currentUserId }, select: { type: true } }
          : false,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const shaped = page.map((p: any) => {
      const myReaction =
        currentUserId && Array.isArray(p.reactions) && p.reactions.length > 0
          ? p.reactions[0].type
          : null;

      return {
        id: p.id,
        caption: p.caption,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        author: p.author,
        mediaType: p.mediaType,
        mediaUrl: p.mediaUrl,
        mediaLocalPath: p.mediaLocalPath,
        likesCount: p._count.reactions,
        likedByMe: !!myReaction,
        myReaction,
        commentsCount: p._count.comments,
      };
    });

    const nextCursor = shaped.length ? shaped[shaped.length - 1].id : null;

    return res.json({
      ok: true,
      posts: shaped,
      nextCursor: hasMore ? nextCursor : null,
      hasMore,
    });
  } catch (err) {
    console.error("Fetch posts error:", err);
    return res.status(500).json({ ok: false, message: "Failed to load posts" });
  }
});

// -----------------------------
// GET /api/posts/user/:userId
// Posts by one user (for profile)
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

// -----------------------------
// DELETE /api/posts/:id
// Delete a post (only author)
// -----------------------------
router.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  if (!req.userId) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }

  const postId = req.params.id;

  try {
    const existing = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        authorId: true,
        mediaUrl: true,
        mediaType: true,
        mediaLocalPath: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ ok: false, message: "Post not found" });
    }

    if (existing.authorId !== req.userId) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    // Best-effort: delete local uploaded file (if any)
    if (existing.mediaLocalPath) {
      try {
        if (fs.existsSync(existing.mediaLocalPath)) {
          fs.unlinkSync(existing.mediaLocalPath);
        }
      } catch {
        // ignore
      }
    }

    // Best-effort: delete Cloudinary asset (if we can derive public_id)
    if (existing.mediaUrl && existing.mediaType) {
      try {
        const url = existing.mediaUrl;
        const m = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
        const publicId = m?.[1];

        if (publicId) {
          const resourceType =
            existing.mediaType === "video" ? "video" : "image";

          await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType,
          });
        }
      } catch {
        // ignore
      }
    }

    // Prisma CASCADE удалит реакции/комменты/связи тегов
    await prisma.post.delete({ where: { id: postId } });

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// -----------------------------
// PATCH /api/posts/:id
// Edit post caption (author only)
// -----------------------------
router.patch("/:id", requireAuth, async (req: AuthedRequest, res) => {
  if (!req.userId) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }

  const postId = req.params.id;

  // validation
  const schema = z.object({
    caption: z.string().max(2000),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "Invalid caption" });
  }

  const caption = parsed.data.caption.trim(); // always string

  try {
    const existing = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    });

    if (!existing) {
      return res.status(404).json({ ok: false, message: "Post not found" });
    }

    if (existing.authorId !== req.userId) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    // update caption
    const updated = await prisma.post.update({
      where: { id: postId },
      data: { caption },
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

    // ---- update hashtags to reflect new caption ----
    const tags = Array.from(
      new Set(
        (caption.match(/#[\p{L}\p{N}_]+/gu) ?? [])
          .map((t) => t.slice(1).toLowerCase())
          .filter(Boolean)
      )
    );

    // clear old relations
    await prisma.postHashtag.deleteMany({
      where: { postId },
    });

    // create new ones
    for (const tag of tags) {
      const hashtag = await prisma.hashtag.upsert({
        where: { tag },
        update: {},
        create: { tag },
      });

      await prisma.postHashtag.create({
        data: {
          postId,
          hashtagId: hashtag.id,
        },
      });
    }

    return res.json({ ok: true, post: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

export default router;
