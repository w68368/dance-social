import express from "express";
import { PrismaClient } from "@prisma/client";

const app = express();
app.use(express.json());

// Prisma подключение
const prisma = new PrismaClient();

// ======================
// Health Check
// ======================
app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`; // Пингуем базу
    res.json({
      ok: true,
      service: "api",
      version: "0.1.0",
      database: "connected",
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      service: "api",
      version: "0.1.0",
      database: "error",
      error: String(err),
    });
  }
});

// ======================
// USERS API
// ======================

// Получить всех пользователей
app.get("/api/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
  });

  res.json(users);
});

// Создать пользователя
app.post("/api/users", async (req, res) => {
  const { email, displayName } = req.body;

  if (!email || !displayName) {
    return res.status(400).json({ error: "email и displayName обязательны" });
  }

  try {
    const user = await prisma.user.create({
      data: { email, displayName },
    });

    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({
      error: "Ошибка при создании пользователя",
      details: String(err),
    });
  }
});

// ======================
// SERVER START
// ======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ API running on http://localhost:${PORT}`);
});
