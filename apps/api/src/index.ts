// apps/api/src/index.ts
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import cookieParser from "cookie-parser";

import authRouter from "./routes/auth.js";
import postsRouter from "./routes/posts.js";
import followRouter from "./routes/follow.js";
import chatsRouter from "./routes/chats.js";
import { prisma } from "./lib/prisma.js";
import notificationsRouter from "./routes/notifications.js";


dotenv.config();

const app = express();

/**
 * If the API runs behind a reverse proxy (e.g., nginx / render / railway),
 * this is required for correct req.ip values and for secure cookies over HTTPS.
 */
app.set("trust proxy", 1);

// -----------------------
// JSON + Cookies
// -----------------------
app.use(express.json());
app.use(cookieParser());

// -----------------------
// CORS with cookies
// You CANNOT use origin:"*" together with credentials:true.
// Use the exact frontend origin from .env
// -----------------------
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true, // allow browser to send/receive HttpOnly cookies
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// -----------------------
// STATIC: serving avatars and (later) post media
// -----------------------
const uploadsDir = path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadsDir));

// -----------------------
// HEALTH CHECK
// -----------------------
app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      ok: true,
      service: "api",
      db: "connected",
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      service: "api",
      db: "error",
      error: String(err),
    });
  }
});

// -----------------------
// AUTH ROUTES (login / refresh / logout / ...)
// -----------------------
app.use("/api/auth", authRouter);

// -----------------------
// POSTS ROUTES (feed / post creation)
// -----------------------
app.use("/api/posts", postsRouter);

// -----------------------
// FOLLOW ROUTES (follows)
// -----------------------
app.use("/api/follow", followRouter);

// -----------------------
// CHATS ROUTES (DM)
// -----------------------
app.use("/api/chats", chatsRouter);

app.use("/api/notifications", notificationsRouter);

// -----------------------
// USERS LIST (optional)
// -----------------------
app.get("/api/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.json(users);
});

// -----------------------
// USERS SEARCH (for @mentions and user search)
// -----------------------
app.get("/api/users/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  if (!q) {
    return res.status(400).json({
      ok: false,
      message: "Empty search query",
    });
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          {
            username: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            displayName: {
              contains: q,
              mode: "insensitive",
            },
          },
        ],
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      },
      take: 10,
    });

    return res.json({
      ok: true,
      users,
    });
  } catch (err) {
    console.error("Users search error", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to search users",
    });
  }
});

// -----------------------
// TAGS SEARCH (for hashtag autocomplete)
// -----------------------
app.get("/api/tags/search", async (req, res) => {
  const qRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const q = qRaw.toLowerCase();

  if (!q || q.length < 1) {
    // for empty input return an empty list
    return res.json({ ok: true, hashtags: [] });
  }

  try {
    const tags = await prisma.hashtag.findMany({
      where: {
        tag: {
          startsWith: q,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        tag: true,
      },
      orderBy: {
        tag: "asc",
      },
      take: 10,
    });

    // frontend (searchHashtags) expects { ok, hashtags: [...] }
    return res.json({
      ok: true,
      hashtags: tags,
    });
  } catch (err) {
    console.error("Tags search error", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to search hashtags",
    });
  }
});

// 🆕 Single user by id (for UserProfile)
app.get("/api/users/:id", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    if (!user) {
      return res
        .status(404)
        .json({ ok: false, message: "User not found" });
    }

    return res.json({ ok: true, user });
  } catch (err) {
    console.error("Get user by id error", err);
    return res
      .status(500)
      .json({ ok: false, message: "Failed to load user" });
  }
});

// -----------------------
// START SERVER
// -----------------------
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`✅ API running on http://localhost:${PORT}`);
  console.log(`CORS origin: ${FRONTEND_ORIGIN}`);
});
