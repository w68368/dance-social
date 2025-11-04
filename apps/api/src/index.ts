import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

import authRouter from "./routes/auth.js";
import { prisma } from "./lib/prisma.js";

dotenv.config();

const app = express();

// JSON body
app.use(express.json());

// CORS для фронта
app.use(cors({ origin: "*", credentials: true }));

// =======================
// STATIC: отдача аватарок
// =======================
const uploadsDir = path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadsDir));

// =======================
// HEALTH CHECK
// =======================
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

// =======================
// AUTH ROUTES
// =======================
app.use("/api/auth", authRouter);

// =======================
// USERS LIST (optional)
// =======================

app.get("/api/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.json(users);
});

// =======================
// START SERVER
// =======================
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`✅ API running on http://localhost:${PORT}`);
});
