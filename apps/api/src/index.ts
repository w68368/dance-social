import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import cookieParser from "cookie-parser";

import authRouter from "./routes/auth.js";
import postsRouter from "./routes/posts.js"; // 🆕 роутер постов
import { prisma } from "./lib/prisma.js";

dotenv.config();

const app = express();

/**
 * Если API будет за reverse-proxy (например, nginx / render / railway),
 * это нужно для корректного req.ip и работы secure-cookie по HTTPS.
 */
app.set("trust proxy", 1);

// -----------------------
// JSON + Cookies
// -----------------------
app.use(express.json());
app.use(cookieParser());

// -----------------------
// CORS с куками
// НЕЛЬЗЯ использовать origin:"*" вместе с credentials:true.
// Подставляем точный фронтенд из .env
// -----------------------
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true, // чтобы браузер слал/получал HttpOnly-cookie
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// -----------------------
// STATIC: отдача аватарок и (позже) медиа постов
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
// AUTH ROUTES (login/refresh/logout/...)
// -----------------------
app.use("/api/auth", authRouter);

// -----------------------
// POSTS ROUTES (feed / создание постов)
// -----------------------
app.use("/api/posts", postsRouter);

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
// START SERVER
// -----------------------
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`✅ API running on http://localhost:${PORT}`);
  console.log(`CORS origin: ${FRONTEND_ORIGIN}`);
});
